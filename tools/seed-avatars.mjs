import { APP_ID, ensure } from './snc.mjs';
const EMOJI = ['🦊','🐼','🦁','🐸','🦄','🐙','🦉','🐨','🐯','🦖','🐢','🦜','🐳','🦔','🐝','🌮','🍕','🤖','👾','🧙'];
const NAMES = ['Fox','Panda','Lion','Frog','Unicorn','Octopus','Owl','Koala','Tiger','T-Rex','Turtle','Parrot','Whale','Hedgehog','Bee','Taco','Pizza','Robot','Alien','Wizard'];
const HUES = [14,32,50,68,86,104,140,158,176,194,212,230,248,266,284,302,320,338,356,120];
for (let i = 0; i < EMOJI.length; i++) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="hsl(${HUES[i]},70%,55%)"/>` +
    `<stop offset="1" stop-color="hsl(${(HUES[i]+40)%360},70%,40%)"/></linearGradient></defs>` +
    `<rect width="100" height="100" fill="url(#g)"/>` +
    `<text x="50" y="62" font-size="52" text-anchor="middle">${EMOJI[i]}</text></svg>`;
  await ensure(`${process.env.SN_SCOPE}_avatar`, 'name=' + NAMES[i], {
    name: NAMES[i], svg, order: i, active: 'true', sys_scope: APP_ID,
  });
}
console.log('seeded 20 avatars');
