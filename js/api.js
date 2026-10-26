/* No response, credential or photo logging. No HTTP cache or persistent photo cache. */
window.FindItAPI = {
  async post(action, data = {}) {
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), action === 'submitPhoto' ? 90000 : 45000);
    try {
      const response = await fetch(window.FINDIT_CONFIG.apiUrl, {
        method: 'POST',
        redirect: 'follow',
        cache: 'no-store',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ ...data, action }),
        signal: controller.signal,
      });
      const text = await response.text();
      let result;
      try {
        result = JSON.parse(text);
      } catch (_) {
        throw new Error('The game service did not reply correctly. Please retry.');
      }
      if (!result.ok) {
        const e = new Error(result.error?.message || 'The request failed.');
        e.code = result.error?.code;
        if (e.code === 'UNKNOWN_ACTION')
          e.message =
            'The Find It game service needs the version 3 update before this app can connect.';
        throw e;
      }
      return result.data;
    } catch (e) {
      if (e.name === 'AbortError')
        throw new Error('The connection timed out. Your game is still here; please retry.');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  },
};
