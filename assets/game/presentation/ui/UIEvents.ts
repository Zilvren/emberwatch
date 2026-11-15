import { Event, Node, Vec2 } from 'cc';
export const ACTION_EVENT = 'game-ui-action';
export const CARD_DROP_EVENT = 'game-ui-card-drop';
export interface ButtonActionEvent {
    id: string;
    payload: string;
}
export interface CardDrop {
    id: string;
    point: Vec2;
    accept: () => void;
}
export class ActionInputEvent extends Event {
    constructor(readonly detail: ButtonActionEvent) {
        super(ACTION_EVENT, true);
    }
}
export class CardDropInputEvent extends Event {
    constructor(readonly detail: CardDrop) {
        super(CARD_DROP_EVENT, true);
    }
}
export function dispatchAction(node: Node, detail: ButtonActionEvent): void {
    node.dispatchEvent(new ActionInputEvent(detail));
}
export function dispatchCardDrop(node: Node, detail: CardDrop): void {
    node.dispatchEvent(new CardDropInputEvent(detail));
}
