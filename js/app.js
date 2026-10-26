/* One screen controller, one poller. Photo data stays in memory only. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id),
    key = 'findItV3Session';
  const state = {
    screen: 'loading',
    session: null,
    data: null,
    photo: null,
    selected: null,
    result: null,
    ballot: null,
    ballotKey: null,
    ballotLoading: false,
    resultLoading: false,
    busy: false,
    polling: false,
    timer: null,
    epoch: 0,
    closed: false,
  };
  let errorTimer, hostRequest, joinRequest;
  const uid = () => crypto.randomUUID();
  const esc = (v) =>
    String(v ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  function show(id) {
    if (state.screen === id) return;
    document.querySelectorAll('.screen').forEach((el) => (el.hidden = el.id !== id));
    state.screen = id;
    window.scrollTo(0, 0);
  }
  function error(message) {
    $('error').textContent = message;
    $('error').hidden = false;
    clearTimeout(errorTimer);
    errorTimer = setTimeout(() => ($('error').hidden = true), 9000);
  }
  function credentials() {
    return { gameCode: state.session.gameCode, playerId: state.session.playerId };
  }
  function storeSession(player) {
    state.session = player;
    try {
      sessionStorage.setItem(key, JSON.stringify(player));
    } catch (_) {}
    state.closed = false;
  }
  function schedule(ms = window.FINDIT_CONFIG.pollMs) {
    clearTimeout(state.timer);
    if (state.session) state.timer = setTimeout(tick, ms);
  }
  function clearGame() {
    state.epoch++;
    clearTimeout(state.timer);
    state.timer = null;
    state.session = null;
    state.data = null;
    state.photo = null;
    state.selected = null;
    state.result = null;
    state.ballot = null;
    state.ballotKey = null;
    state.ballotLoading = false;
    state.resultLoading = false;
    state.closed = false;
    try {
      sessionStorage.removeItem(key);
      localStorage.removeItem('findItV2Session');
    } catch (_) {}
    document.querySelectorAll('#app input').forEach((el) => (el.value = ''));
    [
      'ballot',
      'categories',
      'category-results',
      'winner',
      'players',
      'own-progress',
      'host-progress',
      'waiting-progress',
    ].forEach((id) => $(id).replaceChildren());
    [
      'code',
      'player-count',
      'lobby-note',
      'photo-number',
      'photo-name',
      'photo-description',
      'vote-label',
      'vote-title',
      'vote-budget',
      'vote-progress',
      'vote-message',
      'upload-status',
    ].forEach((id) => ($(id).textContent = ''));
    $('preview').removeAttribute('src');
    $('preview').hidden = true;
    $('submit-photo').hidden = true;
    $('camera').value = '';
    $('library').value = '';
    $('upload-status').textContent = '';
    $('upload-progress').hidden = true;
    $('finish').disabled = false;
    $('save-photo').disabled = false;
    $('finish-status').textContent = '';
    $('connection').textContent = '';
    hostRequest = null;
    joinRequest = null;
    $('error').hidden = true;
  }
  async function loadingScreen(restore = false) {
    const generation = state.epoch;
    show('loading');
    const line = document.querySelector('.loading-line');
    line.replaceWith(line.cloneNode(true));
    await new Promise((r) => setTimeout(r, 2000));
    if (generation !== state.epoch) return;
    if (restore && state.session) {
      show('lobby');
      $('lobby-note').textContent = 'Reconnecting to your game…';
      schedule(0);
    } else show('home');
  }
  async function reset() {
    clearGame();
    await loadingScreen();
  }
  async function mutate(fn) {
    if (state.busy) return;
    state.busy = true;
    $('app').inert = true;
    try {
      await fn();
    } catch (e) {
      error(e.message);
    } finally {
      state.busy = false;
      $('app').inert = false;
      if (state.session) schedule(0);
    }
  }

  async function tick() {
    if (!state.session) return;
    if (state.polling || state.busy) {
      schedule();
      return;
    }
    state.polling = true;
    const epoch = state.epoch;
    try {
      const data = await FindItAPI.post('sync', {
        ...credentials(),
        visible: !document.hidden,
        room: state.screen === 'waiting' ? 'waiting' : 'active',
      });
      if (epoch !== state.epoch || state.busy) return;
      if (data.deleted) {
        await reset();
        return;
      }
      $('connection').textContent = '● Connected';
      route(data);
    } catch (e) {
      if (epoch !== state.epoch) return;
      if (['GAME_NOT_FOUND', 'SESSION_INVALID'].includes(e.code)) {
        await reset();
      } else {
        $('connection').textContent =
          e.code === 'UNKNOWN_ACTION' ? 'Game service update needed' : 'Reconnecting…';
        if (e.code === 'UNKNOWN_ACTION') error(e.message);
      }
    } finally {
      state.polling = false;
      if (state.session) schedule();
    }
  }
  function progress(players) {
    const ready = players.filter((p) => p.ready && p.present).length;
    return (
      '<h2>' +
      ready +
      ' of ' +
      players.length +
      ' ready in the voting room</h2><progress max="' +
      players.length +
      '" value="' +
      ready +
      '" aria-label="Players ready"></progress>' +
      players
        .map(
          (p) =>
            '<div class="progress-row"><div><strong>' +
            esc(p.name) +
            (p.isHost ? ' · Host' : '') +
            '</strong><span>' +
            p.completedCount +
            ' / ' +
            p.challengeCount +
            '</span></div><progress max="' +
            p.challengeCount +
            '" value="' +
            p.completedCount +
            '" aria-label="' +
            esc(p.name) +
            ' categories completed"></progress><small>' +
            (!p.present
              ? 'Reconnecting / away'
              : p.ready
                ? '✓ Ready in voting room'
                : p.complete
                  ? 'Moving to voting room…'
                  : 'Hunting') +
            '</small></div>',
        )
        .join('')
    );
  }
  function route(data) {
    const previous = state.data?.game.status;
    state.data = data;
    if (data.game.status === 'CLOSING') {
      show('closing');
      return;
    }
    if (data.game.status === 'WAITING') {
      show('lobby');
      $('code').textContent = data.game.gameCode;
      $('player-count').textContent = 'Players · ' + data.players.length;
      $('players').innerHTML = data.players
        .map(
          (p) =>
            '<li><strong>' +
            esc(p.name) +
            '</strong><span class="badge">' +
            (p.isHost ? 'HOST' : p.present ? 'JOINED' : 'AWAY') +
            '</span></li>',
        )
        .join('');
      $('start').hidden = !data.player.isHost;
      $('start').disabled = data.players.length < 2;
      $('lobby-note').textContent = data.player.isHost
        ? data.players.length < 2
          ? 'Share your code. At least two players are needed.'
          : 'Start when everyone has joined.'
        : 'Waiting for the host to start…';
      return;
    }
    if (data.game.status === 'PLAYING') {
      const complete = data.challenges.every((c) => c.status !== 'OPEN');
      if (complete) {
        state.photo = null;
        state.selected = null;
        $('preview').removeAttribute('src');
        show('waiting');
        $('waiting-progress').innerHTML = progress(data.players);
        return;
      }
      if (state.screen !== 'photo') show('hunt');
      const done = data.challenges.filter((c) => c.status !== 'OPEN').length;
      $('own-progress').innerHTML =
        '<strong>' +
        done +
        ' / ' +
        data.challenges.length +
        ' categories complete</strong><progress max="' +
        data.challenges.length +
        '" value="' +
        done +
        '" aria-label="Your category progress"></progress>';
      $('categories').replaceChildren(
        ...data.challenges.map((c) => {
          const b = document.createElement('button');
          b.className = 'category' + (c.status !== 'OPEN' ? ' done' : '');
          b.disabled = c.status !== 'OPEN';
          b.innerHTML =
            '<small>CATEGORY ' +
            c.challengeNumber +
            '</small><strong>' +
            esc(c.name) +
            '</strong><span>' +
            esc(c.description) +
            '</span><span style="margin-top:14px">' +
            (c.status === 'SUBMITTED'
              ? '✓ Photo submitted'
              : c.status === 'PASSED'
                ? '✓ Passed'
                : 'Open category →') +
            '</span>';
          b.onclick = () => openPhoto(c);
          return b;
        }),
      );
      $('host-progress').hidden = !data.player.isHost;
      if (data.player.isHost) $('host-progress').innerHTML = progress(data.players);
      return;
    }
    if (['VOTING', 'FINAL_VOTE'].includes(data.game.status)) {
      state.photo = null;
      state.selected = null;
      $('preview').removeAttribute('src');
      show('voting');
      const m = data.ballot;
      $('vote-label').textContent = m.final ? 'ONE LAST VOTE · TIED PHOTOS' : 'THE VOTE';
      $('vote-title').textContent = m.complete ? 'Your votes are in.' : m.name;
      $('vote-budget').textContent = m.selfVoteUsed
        ? 'Your one self-vote has been used. Choose someone else’s photo.'
        : 'Your one self-vote is still available — including in a tie-break.';
      $('vote-progress').textContent = m.done + ' of ' + m.total + ' votes recorded';
      if (m.complete) {
        state.ballot = null;
        state.ballotKey = null;
        $('ballot').replaceChildren();
        $('vote-message').textContent = 'Waiting for everyone else to finish voting…';
      } else if (state.ballotKey !== m.key && !state.ballotLoading) {
        state.ballotKey = null;
        state.ballot = null;
        $('ballot').replaceChildren();
        $('vote-message').textContent = 'Loading the photos…';
        loadBallot(m.key);
      }
      return;
    }
    if (data.game.status === 'FINISHED') {
      if (data.player.closed) state.closed = true;
      if (previous !== 'FINISHED') {
        state.ballot = null;
        state.ballotKey = null;
        $('ballot').replaceChildren();
      }
      if (!state.result && !state.resultLoading) loadResults();
      if (state.result && !['results', 'finale'].includes(state.screen)) show('results');
      if (state.closed) {
        $('finish').disabled = true;
        const n = data.players.filter((p) => p.closed).length;
        $('finish-status').textContent =
          n +
          ' of ' +
          data.players.length +
          ' ready to finish. Waiting before deleting everyone’s photos…';
      }
    }
  }
  async function loadBallot(expected) {
    state.ballotLoading = true;
    const epoch = state.epoch;
    try {
      const data = await FindItAPI.post('getBallot', credentials());
      if (epoch !== state.epoch || data.key !== expected || state.data?.ballot?.key !== expected)
        return;
      state.ballot = data;
      state.ballotKey = data.key;
      renderBallot(data);
    } catch (e) {
      if (epoch === state.epoch) {
        $('vote-message').textContent = e.message;
        state.ballotKey = null;
      }
    } finally {
      state.ballotLoading = false;
    }
  }
  function renderBallot(data) {
    $('vote-message').textContent = '';
    $('ballot').replaceChildren(
      ...data.options.map((o, i) => {
        const card = document.createElement('article');
        card.className = 'photo-card';
        const img = document.createElement('img');
        img.src = o.photoData;
        img.alt = 'Anonymous photo ' + (i + 1);
        const label = document.createElement('p');
        label.textContent = 'Photo ' + (i + 1) + (o.isOwn ? ' · Your photo' : '');
        const b = document.createElement('button');
        b.className = 'primary';
        b.textContent = o.canVote ? 'Vote for this photo' : 'Self-vote already used';
        b.disabled = !o.canVote;
        b.onclick = () => vote(o.entryId);
        card.append(img, label, b);
        return card;
      }),
    );
    if (data.canAbstain) {
      const b = document.createElement('button');
      b.className = 'secondary';
      b.textContent = 'No eligible photo — abstain';
      b.onclick = () => vote('');
      $('ballot').append(b);
      $('vote-message').textContent =
        'Only your own photos remain and you have used your self-vote. Abstain to continue.';
    }
  }
  function vote(entryId) {
    const b = state.ballot;
    if (!b) return;
    mutate(async () => {
      await FindItAPI.post('castVote', { ...credentials(), challengeId: b.challengeId, entryId });
      state.ballotKey = null;
      state.ballot = null;
      $('ballot').replaceChildren();
      $('vote-message').textContent = 'Vote recorded. Moving on…';
    });
  }
  function openPhoto(c) {
    state.selected = c;
    state.photo = null;
    $('photo-number').textContent = 'CATEGORY ' + c.challengeNumber;
    $('photo-name').textContent = c.name;
    $('photo-description').textContent = c.description;
    $('preview').hidden = true;
    $('preview').removeAttribute('src');
    $('submit-photo').hidden = true;
    $('take').textContent = 'Take photo';
    $('upload-status').textContent = '';
    $('upload-progress').hidden = true;
    show('photo');
  }
  async function compress(file) {
    if (!file.type.startsWith('image/')) throw new Error('Please choose an image.');
    if (file.size > 25 * 1024 * 1024) throw new Error('Please choose a photo smaller than 25 MB.');
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const scale = Math.min(1, 1000 / Math.max(img.naturalWidth, img.naturalHeight)),
        canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('This phone could not prepare the photo.');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const result = canvas.toDataURL('image/jpeg', 0.7);
      canvas.width = 0;
      canvas.height = 0;
      if (result.length > 1400000)
        throw new Error('That photo is too large after compression. Choose another.');
      return result;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  async function selectPhoto(e) {
    const input = e.target,
      file = input.files?.[0];
    if (!file || state.busy) return;
    const epoch = state.epoch;
    await mutate(async () => {
      $('upload-status').textContent = 'Preparing photo…';
      const data = await compress(file);
      if (epoch !== state.epoch || state.screen !== 'photo') return;
      state.photo = data;
      $('preview').src = data;
      $('preview').hidden = false;
      $('submit-photo').hidden = false;
      $('take').textContent = 'Retake photo';
      $('upload-status').textContent = 'Ready. Retake it or submit your photo.';
    });
    input.value = '';
  }
  function submitPhoto() {
    if (!state.photo || !state.selected) return;
    mutate(async () => {
      $('upload-status').textContent = 'Uploading photo…';
      $('upload-progress').hidden = false;
      try {
        await FindItAPI.post('submitPhoto', {
          ...credentials(),
          challengeId: state.selected.challengeId,
          photoData: state.photo,
        });
        state.photo = null;
        state.selected = null;
        $('preview').removeAttribute('src');
        $('camera').value = '';
        $('library').value = '';
        show('hunt');
      } catch (e) {
        $('upload-status').textContent =
          e.message + ' Your photo is kept here. Tap Submit to retry.';
        throw e;
      } finally {
        $('upload-progress').hidden = true;
      }
    });
  }
  async function loadResults() {
    state.resultLoading = true;
    const epoch = state.epoch;
    try {
      const data = await FindItAPI.post('getResults', credentials());
      if (epoch !== state.epoch) return;
      state.result = data;
      renderResults(data);
      show('results');
    } catch (e) {
      if (epoch === state.epoch) error(e.message);
    } finally {
      state.resultLoading = false;
    }
  }
  function renderResults(data) {
    $('category-results').innerHTML = data.categories
      .map(
        (c) =>
          '<article class="category"><small>CATEGORY ' +
          c.number +
          '</small><h3>' +
          esc(c.name) +
          '</h3>' +
          (c.winners.length
            ? c.winners
                .map(
                  (w) =>
                    '<img class="result-photo" src="' +
                    w.photoData +
                    '" alt="Category winning photo"><strong>' +
                    esc(w.name) +
                    '</strong><span>' +
                    (c.uncontested
                      ? 'Uncontested'
                      : w.votes +
                        ' vote' +
                        (w.votes === 1 ? '' : 's') +
                        (c.winners.length > 1 ? ' · Joint winner' : '')) +
                    '</span>',
                )
                .join('')
            : '<p>Everyone passed. No photo submitted.</p>') +
          '</article>',
      )
      .join('');
    $('show-finale').textContent = data.winner
      ? 'Reveal the overall winning photo →'
      : 'Finish this hunt →';
  }
  async function showFinale() {
    const w = state.result?.winner;
    if (!state.result) return;
    show('finale');
    $('winner-title').textContent = w ? 'A winning moment.' : 'A hunt without photos.';
    $('save-photo').hidden = !w;
    if (w) {
      $('winner').innerHTML =
        '<img id="winning-photo" src="' +
        w.photoData +
        '" alt="Overall winning photo by ' +
        esc(w.name) +
        '"><h2 style="margin-top:20px">' +
        esc(w.name) +
        '</h2><p>' +
        w.votes +
        ' category vote' +
        (w.votes === 1 ? '' : 's') +
        (w.finalUsed
          ? ' · ' + w.finalVotes + ' final vote' + (w.finalVotes === 1 ? '' : 's')
          : '') +
        '</p>' +
        (w.earliestTieBreak
          ? '<p class="hint">The final vote tied. The first successfully uploaded photo wins.</p>'
          : '');
    } else
      $('winner').innerHTML =
        '<p>Everyone passed their categories, so there is no winning photo this time.</p>';
    $('finish').disabled = true;
    try {
      if (w) await $('winning-photo').decode();
      await FindItAPI.post('acknowledgeResults', credentials());
      $('finish').disabled = state.closed;
    } catch (e) {
      error('Could not confirm the finale. ' + e.message);
      $('finish-status').textContent = 'Tap Reveal again from the results to retry.';
      const retry = document.createElement('button');
      retry.className = 'secondary';
      retry.textContent = 'Retry loading finale';
      retry.onclick = showFinale;
      $('finish-status').append(retry);
    }
  }
  function finish() {
    if (!state.result) return;
    mutate(async () => {
      const result = await FindItAPI.post('closeGame', credentials());
      state.closed = true;
      $('finish').disabled = true;
      if (result.deleted) await reset();
      else
        $('finish-status').textContent =
          'You’re ready. Waiting for the other players before deleting the game…';
    });
  }
  async function savePhoto() {
    const w = state.result?.winner;
    if (!w) return;
    try {
      const blob = await (await fetch(w.photoData)).blob(),
        file = new File([blob], 'Find-It-winning-photo.jpg', { type: 'image/jpeg' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Find It! winning photo' });
        return;
      }
      const url = URL.createObjectURL(blob),
        a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      if (e.name !== 'AbortError') error('Unable to save this photo. ' + e.message);
    }
  }
  function setupForm(formId, action) {
    const form = $(formId);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      mutate(async () => {
        const values = Object.fromEntries(new FormData(form));
        if (formId === 'host-form') {
          hostRequest ??= uid();
          values.requestId = hostRequest;
        } else {
          joinRequest ??= uid();
          values.requestId = joinRequest;
        }
        form.querySelector('.message').textContent = 'Connecting…';
        try {
          const result = await FindItAPI.post(action, values);
          storeSession(result.player);
          form.reset();
          form.querySelector('.message').textContent = '';
          show('lobby');
          $('code').textContent = result.game.gameCode;
          $('lobby-note').textContent = 'Updating the lobby…';
        } catch (e) {
          form.querySelector('.message').textContent = e.message;
          throw e;
        }
      });
    });
    form.addEventListener('input', () => {
      if (formId === 'host-form') hostRequest = null;
      else joinRequest = null;
    });
  }
  document.addEventListener('DOMContentLoaded', () => {
    try {
      state.session = JSON.parse(sessionStorage.getItem(key));
      localStorage.removeItem('findItV2Session');
    } catch (_) {}
    if (!state.session?.playerId) state.session = null;
    $('host').onclick = () => show('setup');
    $('join').onclick = () => show('join-screen');
    document.querySelectorAll('[data-home]').forEach((b) => (b.onclick = () => show('home')));
    setupForm('host-form', 'createGame');
    setupForm('join-form', 'joinGame');
    $('start').onclick = () =>
      mutate(async () => {
        await FindItAPI.post('startGame', credentials());
      });
    $('copy-code').onclick = async () => {
      try {
        await navigator.clipboard.writeText(state.session.gameCode);
        $('copy-code').textContent = 'Copied!';
        setTimeout(() => ($('copy-code').textContent = 'Copy code'), 1500);
      } catch (_) {
        error('Your code is ' + state.session.gameCode + '. You can share it manually.');
      }
    };
    $('take').onclick = () => {
      $('camera').value = '';
      $('camera').click();
    };
    $('choose').onclick = () => {
      $('library').value = '';
      $('library').click();
    };
    $('camera').onchange = selectPhoto;
    $('library').onchange = selectPhoto;
    $('submit-photo').onclick = submitPhoto;
    $('photo-back').onclick = () => {
      state.photo = null;
      state.selected = null;
      $('preview').removeAttribute('src');
      show('hunt');
      schedule(0);
    };
    $('pass').onclick = () => {
      if (!confirm('Pass this category without submitting a photo?')) return;
      mutate(async () => {
        await FindItAPI.post('passChallenge', {
          ...credentials(),
          challengeId: state.selected.challengeId,
        });
        state.photo = null;
        state.selected = null;
        $('preview').removeAttribute('src');
        show('hunt');
      });
    };
    $('show-finale').onclick = () => mutate(showFinale);
    $('finish').onclick = finish;
    $('save-photo').onclick = savePhoto;
    document.addEventListener('visibilitychange', () => {
      if (state.session) schedule(0);
    });
    loadingScreen(!!state.session);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
})();
