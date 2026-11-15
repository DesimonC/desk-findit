begin;

insert into public.challenge_packs (id, name, description, seasonal, active)
values ('work', 'Work', '18 workplace photo challenges', false, true)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  seasonal = excluded.seasonal,
  active = excluded.active;

insert into public.challenges (title, description, theme, difficulty, pack_id, active)
select title, description, 'Workplace', difficulty, 'work', true
from (values
  ('Find a health and safety issue', 'Take a photo of an existing issue you can safely observe, such as a walkway blocked by boxes.', 'medium'),
  ('Find something broken', 'Photograph a broken item with the damage visible in the shot.', 'easy'),
  ('Find a round advertisement', 'Photograph an advert with a circular shape.', 'medium'),
  ('Find a sign with three different symbols on it', 'Frame the sign so all three symbols are visible.', 'medium'),
  ('Find something being held together with tape', 'Make the tape and the item it is holding together clear in the same shot.', 'easy'),
  ('Find a tool with a brightly coloured handle', 'Show the whole tool and make its colourful handle stand out.', 'easy'),
  ('Find a clock showing the wrong time', 'Photograph a clock whose display disagrees with the current time.', 'medium'),
  ('Find a stack of five or more identical things', 'Choose an angle that lets players count at least five items in the stack.', 'easy'),
  ('Find a label that tells you which way up something goes', 'Photograph the label so the arrows or instructions can be read.', 'easy'),
  ('Find something with at least ten buttons', 'Keep enough of the buttons in frame to count them.', 'easy'),
  ('Find a piece of equipment with a warning sticker', 'Include both the sticker and the equipment it belongs to.', 'easy'),
  ('Find something that looks like a face', 'Frame an object so its features look like a face.', 'easy'),
  ('Find an item with a date from a previous year', 'Take a photo of the item with its printed year visible.', 'medium'),
  ('Find a handle big enough to grip with both hands', 'Photograph the handle so its size is clear from the surrounding objects.', 'easy'),
  ('Find a company logo in an unexpected place', 'Show the logo and enough of its surroundings to explain why it is unexpected.', 'medium'),
  ('Find three different things of the same colour', 'Get all three things in the same photo.', 'easy'),
  ('Find a shadow that makes an interesting shape', 'Make the outline of the shadow the focus of your photo.', 'easy'),
  ('Find something that makes your working day easier', 'Photograph it like it is the star of an advert.', 'medium')
) as work_challenges (title, description, difficulty)
on conflict (title) do update set
  description = excluded.description,
  theme = excluded.theme,
  difficulty = excluded.difficulty,
  active = excluded.active
where challenges.pack_id = excluded.pack_id;

commit;
