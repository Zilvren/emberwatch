import type {CombatState, InventoryState, RewardState, SettlementState, FeedbackState} from '../assets/game/core/systems/RuleContext';
import type {GameReadModel} from '../assets/game/core/GameReadModel';
declare const combat: CombatState, inventory: InventoryState, reward: RewardState, settlement: SettlementState, feedback: FeedbackState, view: GameReadModel;
combat.armor = 9;
inventory.supplies = 2;
// @ts-expect-error Combat cannot alter permanent inventory.
combat.cards = [];
// @ts-expect-error Inventory cannot advance the route.
inventory.pathIndex = 2;
// @ts-expect-error Rewards cannot repair player armor.
reward.armor = 10;
// @ts-expect-error Settlement cannot change route selection.
settlement.route = 'B';
// @ts-expect-error Feedback can only change logs and revision.
feedback.supplies = 10;
// @ts-expect-error UI state is deeply readonly.
view.battle!.hp = 0;
// @ts-expect-error UI has no mutation command.
view.play('card-1');
