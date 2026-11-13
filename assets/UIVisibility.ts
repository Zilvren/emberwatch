import { _decorator, Component } from 'cc';
const {ccclass,property}=_decorator;
@ccclass('UIVisibility')
export class UIVisibility extends Component {
    @property key='';
    @property inverse=false;
    setValue(value:unknown):void {this.node.active=this.inverse?!value:!!value;}
}
