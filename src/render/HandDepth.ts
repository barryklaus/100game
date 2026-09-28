/** Camera-space slabs keep the entire tilted cards apart, including their edges.
 * Extents are ratios of camera distance, so perspective compensation preserves
 * the same apparent card size when a card is brought in front of its neighbour.
 */
export function separatedHandDepths(extentRatios:readonly number[],backDistance=5.8,gap=.045):number[]{
  let nearest=backDistance;
  return extentRatios.map((extent,index)=>{
    const ratio=Math.max(0,Math.min(.85,extent));
    const distance=index===0?backDistance:(nearest-gap)/(1+ratio);
    nearest=distance*(1-ratio);
    return distance;
  });
}
