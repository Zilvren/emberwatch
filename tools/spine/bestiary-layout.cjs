// Cell indices address the auxiliary 4 x 3 joint-underpaint sheets. All visible setup
// pixels come from the chosen concept sheet, using the anatomical cut lines beside this file.
const part=(name,cell,parent,options={})=>({name,cell,parent,...options});
const moth={
 title:'灰灯蛾',root:'flight',
 parts:[
  part('thorax',5,null,{central:true}),part('abdomen',6,'thorax'),part('hind-left',2,'thorax'),part('hind-right',3,'thorax'),
  part('fore-left',0,'thorax'),part('fore-right',1,'thorax'),part('head',4,'thorax'),
  part('feeler-left',7,'head'),part('feeler-right',8,'head'),part('far-left-leg',9,'thorax'),part('far-right-leg',9,'thorax'),
  part('leg-left',10,'thorax'),part('leg-left-shin',10,'leg-left'),part('leg-right',11,'thorax'),part('leg-right-shin',11,'leg-right')
 ],
 draw:['hind-left','hind-right','fore-right','fore-left','far-left-leg','far-right-leg','abdomen','thorax','leg-left','leg-left-shin','leg-right','leg-right-shin','feeler-right','feeler-left','head']
};
const crab={
 title:'叩石螯',root:'stance',
 parts:[
  part('hull',0,null,{central:true,noHiddenEye:true}),part('shield',1,'hull'),part('claw-arm',2,'hull'),part('palm',3,'claw-arm'),part('finger',4,'palm'),
  part('far-claw',5,'hull'),part('near-fore-thigh',6,'hull'),part('near-fore-shin',7,'near-fore-thigh'),
  part('near-hind-thigh',8,'hull'),part('near-hind-shin',9,'near-hind-thigh'),
  part('far-fore-leg',10,'hull',{bindParent:'stance'}),part('far-hind-leg',11,'hull',{bindParent:'stance'})
 ],
 ik:[['fore-plant','near-fore-thigh','near-fore-shin'],['hind-plant','near-hind-thigh','near-hind-shin']],
 draw:['far-fore-leg','far-hind-leg','hull','near-hind-thigh','near-hind-shin','far-claw','claw-arm','palm','finger','near-fore-thigh','near-fore-shin','shield']
};
const idol={
 title:'垂幡守像',root:'altar',
 parts:[
  part('plinth',11,null,{central:true}),part('robe',3,'plinth',{central:true}),part('neck',1,'robe'),part('mask',0,'neck'),part('collar',2,'robe'),
  part('left-sleeve',4,'robe'),part('left-hand',5,'left-sleeve'),part('right-sleeve',6,'robe'),part('right-hand',7,'right-sleeve'),
  part('pennant-left',8,'robe',{flexAt:[1206,493]}),part('pennant-right',9,'robe',{flexAt:[1359,499]}),part('belt',10,'robe'),
  part('left-cuff',4,'left-sleeve',{attachBone:'left-sleeve'}),part('right-cuff',6,'right-sleeve',{attachBone:'right-sleeve'})
 ],
 draw:['plinth','right-sleeve','right-hand','right-cuff','robe','belt','left-sleeve','left-hand','left-cuff','pennant-right','pennant-left','neck','collar','mask']
};
module.exports={'ash-moth':moth,'stone-claw':crab,'veil-idol':idol};
