import { Label, Node } from 'cc';
import { UIValue } from './UIValue';
/** Used only by the one-time editor bake; not needed by the game controller. */
export class UIAuthoringScope {
    static enabled=false;static scope='';static counts:Record<string,number>={};
    static begin(name:string):()=>void {const oldName=this.scope,old=this.counts;this.scope=name;this.counts={};return()=>{this.scope=oldName;this.counts=old;};}
    static label(label:Label,root:Node,localIndex:number):void {
        if(!this.enabled)return;
        const key=root.name.startsWith('Card ')?`card/text${localIndex}`:`${this.scope}/text${this.counts.text??0}`;
        if(!root.name.startsWith('Card '))this.counts.text=(this.counts.text??0)+1;
        label.node.name=key.replace(/\//g,'-');const binding=label.node.addComponent(UIValue);binding.key=key;
    }
}
