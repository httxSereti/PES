export enum ActionType {
    PROFILE = "PROFILE",
    LEVEL = "LEVEL",
    MULT = "MULT",
    CHASTER_TIME_UPDATE = "CHASTER_TIME_UPDATE",
}

export interface TriggerAction {
    id: string;
    trigger_rule_id: string;
    action_type: ActionType;
    payload: Record<string, unknown>;
    duration: number;
    cumulative: boolean;
    sort_order: number;
    created_at: Date;
    rule: TriggerRule;
}

export type CreateTriggerAction = Omit<TriggerAction, 'created_at' | 'rule'> & {
    duration?: number;
    cumulative?: boolean;
    sort_order?: number;
};

export type UpdateTriggerAction = Partial<Omit<TriggerAction, 'id' | 'trigger_rule_id' | 'created_at' | 'rule'>>;

export interface TriggerRule {
    id: string;
    event_type: string;
    name: string;
    description?: string | null;
    enabled: boolean;
    priority: number;
    created_at: Date;
    updated_at: Date;
    actions: TriggerAction[];
}

export type CreateTriggerRule = Omit<TriggerRule, 'created_at' | 'updated_at' | 'actions'> & {
    enabled?: boolean;
    priority?: number;
};

export type UpdateTriggerRule = Partial<Omit<TriggerRule, 'id' | 'created_at' | 'updated_at' | 'actions'>>;