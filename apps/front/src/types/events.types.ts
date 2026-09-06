import type { TriggerActionDraft, TriggerRuleDraft } from './websocket.generated';

export { ActionType } from './websocket.generated';
export type {
    TriggerRule,
    TriggerAction,
    TriggerRuleLabel,
    TriggeredEvent,
    TriggeredRule,
    TriggeredAction,
    TriggerRuleDraft,
    TriggerActionDraft,
    TriggerRuleEditDraft,
} from './websocket.generated';

// Drafts used when creating/editing rules and actions over WS
// (payloads of trigger_rules:create / trigger_rules:edit).
export type CreateTriggerRule = TriggerRuleDraft;
export type CreateTriggerAction = TriggerActionDraft;
export type UpdateTriggerRule = Partial<TriggerRuleDraft>;
export type UpdateTriggerAction = Partial<TriggerActionDraft>;
