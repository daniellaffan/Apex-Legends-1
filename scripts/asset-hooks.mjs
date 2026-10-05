/* Lets Node import the game's audio/image assets as empty strings (used by scripts/penalty-test.mjs). */
export async function load(url, context, next){
  if(/\.(mp3|wav|ogg|png|jpg|svg|woff2?)$/.test(url)) return { format:'module', source:'export default ""', shortCircuit:true };
  return next(url, context);
}
