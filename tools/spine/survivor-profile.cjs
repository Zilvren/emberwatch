// Landmarks on the 1585 × 992 golden-waist sheet, measured in its own coordinates.
// The profile is sampled from the high-resolution master at twice this working scale.
const crop = { left: 625, top: 0, width: 306, height: 934, density: 2 };
const stageScale = .48;
const ground = [774, 920];
const point = ([x, y]) => [(x - crop.left) * crop.density, (y - crop.top) * crop.density];
const box = ([l, t, r, b]) => [...point([l, t]), ...point([r, b])];
const outline = text => text.trim().split(/\s+/).map(s => s.split(',').map(Number));
const polygon = text => outline(text).map(point);

// Each border follows a material seam. The source matte determines the outer contour.
const surfaces = {
  hips: [1, null, [788,459], [790,360], '740,341 792,337 851,340 854,380 845,418 819,462 752,466 714,442 710,397', 28],
  chest: [0, 'hips', [790,360], [785,192], '720,202 752,176 806,178 839,208 852,253 857,305 861,343 846,356 814,381 772,382 714,361 701,322', 38],
  head: [0, 'chest', [784,160], [821,76], '703,7 865,7 865,151 843,158 826,162 813,157 801,175 753,167 748,150 705,145', 13],
  'hair-lock': [0, 'head', [750,77], [748,142], '703,68 738,66 757,63 751,77 762,72 755,86 764,85 755,100 756,108 749,119 752,123 744,136 748,142 740,147 729,144 720,135 708,120', 7],
  hood: [11, 'chest', [760,187], [689,268], '728,160 763,164 779,184 756,193 733,214 719,244 708,278 695,278 678,248 673,232 695,216 682,199 687,193 710,181', 19],
  scarf: [5, 'chest', [782,174], [834,201], '719,151 743,149 759,151 773,154 791,160 808,166 822,172 836,180 842,186 839,195 841,200 838,210 831,211 813,205 794,195 777,189 755,185 737,187 718,193 706,195 707,181 714,170', 13],
  mantle: [11, 'chest', [783,202], [687,346], '731,189 755,183 780,186 807,197 832,206 840,216 837,244 828,258 809,270 778,282 750,295 724,312 708,325 687,348 680,340 685,321 692,289 700,261 709,228', 23, [749,277]],
  'back-flap': [11, 'hips', [731,397], [707,744], '716,367 744,377 748,422 738,470 747,504 744,549 736,582 727,622 719,672 709,727 705,746 698,694 688,661 694,635 699,605 687,582 698,541 705,489 702,442', 25, [718,600]],
  'coat-skirt': [11, 'hips', [785,405], [698,656], '714,388 754,387 824,383 849,406 854,459 857,509 852,546 823,565 800,583 775,599 751,615 736,627 718,638 699,663 689,661 694,630 702,597 708,553 707,503 712,455', 35, [752,547]],
  'tunic-lining': [0, 'hips', [827,414], [847,630], '825,397 851,399 857,421 863,504 869,528 854,536 859,633 829,625 806,613 810,550', 17],
  strap: [1, 'chest', [841,231], [803,391], '837,216 844,225 850,248 851,264 855,286 852,303 839,331 820,369 808,396 792,411 787,398 798,374 815,334 830,294 841,265', 11],
  'ration-bag': [1, 'hips', [738,420], [716,519], '721,383 741,379 739,402 733,415 746,426 761,428 773,421 776,428 775,462 778,483 770,504 753,518 734,526 718,526 699,520 684,509 676,495 678,473 687,454 704,426 716,411', 16],
  'card-case': [1, 'hips', [837,396], [837,449], '821,393 822,382 826,378 848,377 855,380 855,391 862,392 861,448 830,453 819,447 818,397', 10],
  'near-sleeve': [2, 'chest', [785,211], [777,345], '739,268 779,254 814,246 827,273 814,307 816,328 803,351 803,376 806,390 802,400 781,400 754,408 746,404 746,394 741,381 739,367 730,365 717,381 719,349 730,305', 27],
  'near-bracer': [3, 'near-sleeve', [777,345], [799,477], '751,401 759,396 781,392 801,392 806,401 807,418 812,438 814,444 811,449 816,456 820,471 817,477 799,480 781,480 775,467 777,460 769,447 769,439 763,424 756,417', 20],
  'near-hand': [4, 'near-bracer', [799,477], [801,541], '782.9,475 785,472 790,471.4 802,469.5 812.4,468.3 814.3,471 815,477 817.2,482.5 820,490 823.4,497.5 825.4,503 825.1,516.5 826,520.8 824.4,522.5 823.4,522 823.4,526 821.8,531 819.5,535.3 815,542.7 813.2,543.3 811.2,542.6 810.6,540.8 811.6,536.6 807,543.8 804,546.8 801.2,547.8 799.4,546.6 799.3,543.3 800.3,540.5 797.3,543.6 795.1,544.1 793,542.5 792.9,540.5 794,534 792,532.6 791.1,535.3 789.7,536.2 787.8,535.6 787,533.5 787.4,521 786.3,518 786,509.5 784.5,504.5 784,498 784,482', 12],
  'near-thigh': [8, 'hips', [784,462], [781,651], '726,491 774,433 830,458 848,530 850,563 845,608 837,650 833,666 834,686 831,706 815,725 799,736 750,735 737,726 728,712 718,705 725,680 727,660 718,650 714,612', 32],
  'near-shin': [9, 'near-thigh', [781,651], [766,842], '731,722 752,721 780,724 809,725 812,730 807,744 803,753 800,775 798,791 792,811 788,833 790,843 776,851 750,846 746,837 747,824 744,811 746,800 741,784 741,773 738,760 732,753 734,744 731,739', 20],
  'near-boot': [10, 'near-shin', [766,842], [860,909], '738,835 747,838 773,840 789,835 795,838 794,852 802,864 811,872 819,879 831,886 842,890 856,891 864,895 867,904 870,915 843,921 803,924 733,924 730,913 734,894 737,881 740,868 736,857', 16]
};
const priority = ['hair-lock','scarf','head','mantle','near-hand','near-bracer','near-sleeve','card-case','ration-bag','strap','hood','back-flap','coat-skirt','tunic-lining','near-boot','near-shin','near-thigh','hips','chest'];
const draw = ['near-thigh','near-shin','near-boot','tunic-lining','back-flap','coat-skirt','chest','hips','strap','ration-bag','card-case','near-sleeve','near-bracer','near-hand','hood','mantle','head','hair-lock','scarf'];
const parts = {}, boxes = {}, definitions = [];
for (const [name,[cell,parent,pivot,tip,line,extra=16,bend]] of Object.entries(surfaces)) {
  const edges = outline(line), xs = edges.map(p=>p[0]), ys = edges.map(p=>p[1]);
  boxes[name] = box([Math.min(...xs)-5,Math.min(...ys)-5,Math.max(...xs)+5,Math.max(...ys)+5]);
  parts[name] = {pivot:point(pivot),tip:point(tip),border:edges.map(point),extra:extra*crop.density};
  definitions.push({name,cell,parent,...(bend?{flexAt:point(bend)}:{}),...(['hips','chest','coat-skirt','near-thigh'].includes(name)?{central:true,opaqueUnderpaint:true}:{}),
    ...(name==='coat-skirt'?{clothRepair:box([754,431,834,553])}:{}),
    ...(name==='near-thigh'?{hiddenInside:(px,py)=>{const x=px/crop.density+crop.left,y=py/crop.density;return y<508||y>692||x<=trouserSeam(y)+.5;}}:{}),
    ...(name==='near-boot'?{transform:'onlyTranslation'}:{})});
}
function support(name,bone,cell,bounds,shape,uv=[.22,.14,.78,.86]){
  return {name,bone,cell,box:box(bounds),shape:polygon(shape),uv};
}
const supports=[
  support('near-trouser-lining','near-thigh',8,[719,456,839,734],'754,459 792,457 819,470 830,501 833,556 830,604 828,645 828,684 817,717 803,731 754,731 741,720 725,700 732,669 724,622 724,567 726,512',[.18,.08,.86,.95]),
  support('hips-lining','hips',1,[708,413,846,635],'731,427 778,415 823,424 843,465 841,554 803,585 748,625 717,626 709,574 711,496'),
  support('inner-tunic','chest',0,[698,176,856,453],'733,192 764,177 810,183 834,211 851,268 852,320 847,376 834,445 754,452 714,430 702,393 703,330 718,257'),
  support('inner-skirt','hips',11,[685,367,863,682],'722,375 822,367 844,388 857,450 860,522 830,564 785,593 732,632 697,669 688,649 697,593 701,526 709,441'),
  support('knee-lining','near-shin',9,[728,697,817,753],'742,704 774,698 808,707 815,722 807,746 779,752 747,747 730,731',[.18,.17,.84,.52]),
  support('near-underarm','near-sleeve',2,[738,207,815,402],'756,219 786,209 805,223 814,275 808,333 798,379 788,400 755,397 743,368 741,316 744,265')
];
// Where overlapping edges have nearly the same value, preserve the material on its own moving layer.
function trouserSeam(y){
  if(y<558)return 829+(y-508)*.1;
  if(y<646)return 834-(y-558)*.057;
  return 829+(y-646)*.022;
}
function refineOwner(px,py,data,k,owner){
  const x=px/crop.density+crop.left,y=py/crop.density,red=data[k],blue=data[k+2];
  if(owner==='near-thigh'&&y>530&&y<640&&x>trouserSeam(y)+.5)return 'tunic-lining';
  if(owner==='near-thigh'&&blue>red+2&&y<669-.74*(x-692)+9)return x<724?'back-flap':'coat-skirt';
  if(owner==='near-hand'&&y>521&&blue>red+3)return 'coat-skirt';
  if(owner==='near-bracer'&&y>405&&blue>red+3)return 'coat-skirt';
  return owner;
}
const zones={origin:point(ground),scale:stageScale/crop.density,rect:box([672,5,875,926]),
  envelope:polygon('706,7 851,7 861,56 858,124 842,154 815,157 821,165 838,177 849,197 844,209 853,239 862,286 865,344 861,382 865,397 866,453 872,536 865,548 865,637 846,643 842,678 842,698 819,732 807,759 802,800 797,830 801,849 809,867 828,881 846,888 869,890 875,918 835,924 723,924 725,888 728,861 729,835 737,826 731,783 725,748 723,727 716,715 715,735 703,751 694,700 683,667 690,609 681,583 690,541 675,514 672,483 680,448 695,414 682,402 682,365 672,350 679,296 689,278 673,252 672,230 684,210 681,195 698,178 711,161 721,149 748,147 719,141 703,112'),
  footClips:[{x:[720,876].map(x=>point([x,0])[0]),y:point([0,908])[1],polygon:polygon('732,904 865,903 869,908 868,914 858,916 843,917 836,919 819,920 803,920 788,918 777,916 776,919.5 747,919.5 733,919 733,915')}],
  priority,parts,refineOwner};
const layout={title:'青年求生者',root:'PoseRoot',parts:definitions,draw,ik:[['near-plant','near-thigh','near-shin']]};
module.exports={crop,stageScale,ground,point,box,zones,layout,under:{boxes,supports},world:([x,y])=>[(x-ground[0])*stageScale,(ground[1]-y)*stageScale]};
