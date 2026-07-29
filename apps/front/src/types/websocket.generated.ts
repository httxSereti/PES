// AUTO-GENERATED from apps/app/src/api/ws/schema.py
// by apps/app/scripts/generate_ws_types.py — DO NOT EDIT.
// Regenerate with: pnpm codegen:ws

export const WS_SCHEMA_VERSION = 1;

export enum ActionType {
    PROFILE = "PROFILE",
    LEVEL = "LEVEL",
    MULT = "MULT",
    CHASTER_TIME_UPDATE = "CHASTER_TIME_UPDATE",
}

export interface UnitLevelChanges {
    ch_A?: string;
    ch_B?: string;
}

export interface UnitModeChange {
    mode?: number;
}

export interface UnitPowerModeChange {
    power_mode?: 'L' | 'H' | 'D';
}

export interface UnitAdjChange {
    adj_1?: number;
    adj_2?: number;
}

export interface TriggerRuleUpdatePayload {
    rule_id: string;
    name?: string;
    description?: string;
    event_type?: string;
    enabled?: boolean;
    priority?: number;
}

export interface TriggerRuleDraft {
    name: string;
    event_type: string;
    description?: string;
    enabled: boolean;
    priority: number;
    actions: TriggerActionDraft[];
    labels: string[];
}

export interface TriggerActionDraft {
    action_type: ActionType;
    payload: Record<string, unknown>;
    duration: number;
    cumulative: boolean;
    sort_order: number;
}

export interface TriggerRuleDeletePayload {
    rule_id: string;
}

export interface HardwareMk2btUpdatePayload {
    id: 'UNIT1' | 'UNIT2' | 'UNIT3';
    enabled: boolean;
}

export interface HardwareMk2btRescanPayload {
    id: 'UNIT1' | 'UNIT2' | 'UNIT3';
}

export interface HardwareSensorUpdatePayload {
    id: 'sound' | 'motion1' | 'motion2';
    enabled: boolean;
}

export interface HardwareSensorRescanPayload {
    id: 'sound' | 'motion1' | 'motion2';
}

export interface ConnectedPayload {
    message: string;
    userId: string;
    schemaVersion: number;
}

export interface CommandResult {
    status: string;
    message?: string;
}

export interface BaseSensor {
    id: string;
    sensor_online: boolean;
    alarm_enable: boolean;
}

export interface SensorUpdatePayload {
    id: string;
    changes: Partial<Sensor>;
    partial?: boolean;
}

export interface UnitSettings {
    id: string;
    ch_A: number;
    ch_A_multiplier: number;
    ch_B: number;
    ch_B_multiplier: number;
    ch_A_use: string;
    ch_B_use: string;
    ch_A_limit: UsageLimit;
    ch_B_limit: UsageLimit;
    adj_1: number;
    adj_2: number;
    adj_3: number;
    adj_4: number;
    ch_link: boolean;
    level_d: boolean;
    level_h: boolean;
    level_map: number;
    power_bias: number;
    mode: number;
    cnx_ok: boolean;
    sync: boolean;
    updated: boolean;
}

export interface UsageLimit {
    start: number;
    warn: number;
    max: number;
}

export interface UnitUpdatePayload {
    id: string;
    changes: Partial<UnitSettings>;
}

export interface StatusMessage {
    status: string;
    message: string;
}

export interface TriggeredEvent {
    id: string;
    event_type: string;
    origin: string;
    event_data: Record<string, unknown>;
    triggered_at: string;
    triggered_rules: TriggeredRule[];
}

export interface TriggeredRule {
    rule_id: string | null;
    rule_name: string;
    priority: number;
    actions: TriggeredAction[];
}

export interface TriggeredAction {
    queue_item_id: string;
    action_id: string | null;
    action_type: string;
    display_name: string | null;
    duration: number;
    cumulative: boolean;
    payload: Record<string, unknown>;
}

export interface QueueStatus {
    paused: boolean;
    waiting: number;
    running: number;
    total_in_queue: number;
    total_done: number;
    total_cancelled: number;
}

export interface TriggerRule {
    id: string;
    event_type: string;
    name: string;
    description: string | null;
    enabled: boolean;
    priority: number;
    actions: TriggerAction[];
    labels: TriggerRuleLabel[];
}

export interface TriggerAction {
    id: string;
    trigger_rule_id: string;
    action_type: ActionType;
    payload: Record<string, unknown>;
    duration: number;
    cumulative: boolean;
    sort_order: number;
}

export interface TriggerRuleLabel {
    id: string;
    name: string;
    description: string;
}

export interface TriggerRuleBroadcastPayload {
    id: string;
    changes: Partial<TriggerRule>;
}

export interface TriggerRuleCreatedPayload {
    rule: TriggerRule;
}

export interface TriggerRuleDeletedPayload {
    id: string;
}

export interface TriggerRuleEditDraft extends TriggerRuleDraft {
    rule_id: string;
}

export interface MotionSensor extends BaseSensor {
    sensor_type: 'motion';
    position_ref: number;
    position_alarm_level: number;
    position_delay_on: number;
    position_delay_off: number;
    move_alarm_level: number;
    move_delay_on: number;
    move_delay_off: number;
    position_alarm_counter: number;
    move_alarm_counter: number;
    position_alarm_number: number;
    move_alarm_number: number;
    position_alarm_number_action: number;
    move_alarm_number_action: number;
    current_position: number;
    current_move: number;
}

export interface SoundSensor extends BaseSensor {
    sensor_type: 'sound';
    sound_alarm_level: number;
    sound_delay_on: number;
    sound_delay_off: number;
    sound_alarm_counter: number;
    sound_alarm_number: number;
    sound_alarm_number_action: number;
    current_sound: number;
}

export interface PingCommand {
    id?: string;
    type: 'ping';
}

export interface CoreStopCommand {
    id?: string;
    type: 'core:stop';
    payload?: Record<string, unknown>;
}

export interface SensorsUpdateCommand {
    id?: string;
    type: 'sensors:update';
    payload: Record<string, Partial<Sensor>>;
}

export interface UnitsUpdateLevelCommand {
    id?: string;
    type: 'units:update_level';
    payload: Record<string, UnitLevelChanges>;
}

export interface UnitsUpdateModeCommand {
    id?: string;
    type: 'units:update_mode';
    payload: Record<string, UnitModeChange>;
}

export interface UnitsUpdatePowerModeCommand {
    id?: string;
    type: 'units:update_power_mode';
    payload: Record<string, UnitPowerModeChange>;
}

export interface UnitsUpdateAdjCommand {
    id?: string;
    type: 'units:update_adj';
    payload: Record<string, UnitAdjChange>;
}

export interface TriggerRulesUpdateCommand {
    id?: string;
    type: 'trigger_rules:update';
    payload: TriggerRuleUpdatePayload;
}

export interface TriggerRulesCreateCommand {
    id?: string;
    type: 'trigger_rules:create';
    payload: TriggerRuleDraft;
}

export interface TriggerRulesEditCommand {
    id?: string;
    type: 'trigger_rules:edit';
    payload: TriggerRuleEditDraft;
}

export interface TriggerRulesDeleteCommand {
    id?: string;
    type: 'trigger_rules:delete';
    payload: TriggerRuleDeletePayload;
}

export interface HardwareUpdateMk2btCommand {
    id?: string;
    type: 'hardware:update_mk2bt';
    payload: HardwareMk2btUpdatePayload;
}

export interface HardwareRescanMk2btCommand {
    id?: string;
    type: 'hardware:rescan_mk2bt';
    payload: HardwareMk2btRescanPayload;
}

export interface HardwareUpdateBtSensorsCommand {
    id?: string;
    type: 'hardware:update_bt_sensors';
    payload: HardwareSensorUpdatePayload;
}

export interface HardwareRescanBtSensorsCommand {
    id?: string;
    type: 'hardware:rescan_bt_sensors';
    payload: HardwareSensorRescanPayload;
}

export interface ConnectedMessage {
    id?: string;
    type: 'connected';
    payload: ConnectedPayload;
}

export interface PingMessage {
    id?: string;
    type: 'ping';
}

export interface PongMessage {
    id?: string;
    type: 'pong';
}

export interface CommandMessage {
    id?: string;
    type: 'command';
    payload: CommandResult;
}

export interface SensorsInitMessage {
    id?: string;
    type: 'sensors:init';
    payload: Record<string, Sensor>;
}

export interface SensorsUpdateMessage {
    id?: string;
    type: 'sensors:update';
    payload: SensorUpdatePayload;
}

export interface UnitsInitMessage {
    id?: string;
    type: 'units:init';
    payload: Record<string, UnitSettings>;
}

export interface UnitsUpdateMessage {
    id?: string;
    type: 'units:update';
    payload: UnitUpdatePayload;
}

export interface HardwareInitMessage {
    id?: string;
    type: 'hardware:init';
    payload: Record<string, boolean>;
}

export interface HardwareUpdateMessage {
    id?: string;
    type: 'hardware:update';
    payload: Record<string, boolean>;
}

export interface CoreStopMessage {
    id?: string;
    type: 'core:stop';
    payload: StatusMessage;
}

export interface EventsHistoryMessage {
    id?: string;
    type: 'events:history';
    payload: TriggeredEvent[];
}

export interface EventsTriggeredMessage {
    id?: string;
    type: 'events:triggered';
    payload: TriggeredEvent;
}

export interface QueueUpdateMessage {
    id?: string;
    type: 'queue:update';
    payload: QueueStatus;
}

export interface TriggerRulesLoadMessage {
    id?: string;
    type: 'trigger_rules:load';
    payload: TriggerRule[];
}

export interface TriggerRulesLoadLabelsMessage {
    id?: string;
    type: 'trigger_rules:load_labels';
    payload: TriggerRuleLabel[];
}

export interface TriggerRulesUpdateMessage {
    id?: string;
    type: 'trigger_rules:update';
    payload: TriggerRuleBroadcastPayload;
}

export interface TriggerRulesCreateMessage {
    id?: string;
    type: 'trigger_rules:create';
    payload: TriggerRuleCreatedPayload;
}

export interface TriggerRulesCreateLabelMessage {
    id?: string;
    type: 'trigger_rules:create_label';
    payload: TriggerRuleLabel;
}

export interface TriggerRulesDeleteMessage {
    id?: string;
    type: 'trigger_rules:delete';
    payload: TriggerRuleDeletedPayload;
}

export type Sensor = MotionSensor | SoundSensor;

export type WebSocketClientMessage =
    | PingCommand
    | CoreStopCommand
    | SensorsUpdateCommand
    | UnitsUpdateLevelCommand
    | UnitsUpdateModeCommand
    | UnitsUpdatePowerModeCommand
    | UnitsUpdateAdjCommand
    | TriggerRulesUpdateCommand
    | TriggerRulesCreateCommand
    | TriggerRulesEditCommand
    | TriggerRulesDeleteCommand
    | HardwareUpdateMk2btCommand
    | HardwareRescanMk2btCommand
    | HardwareUpdateBtSensorsCommand
    | HardwareRescanBtSensorsCommand;

export type WebSocketServerMessage =
    | ConnectedMessage
    | PingMessage
    | PongMessage
    | CommandMessage
    | SensorsInitMessage
    | SensorsUpdateMessage
    | UnitsInitMessage
    | UnitsUpdateMessage
    | HardwareInitMessage
    | HardwareUpdateMessage
    | CoreStopMessage
    | EventsHistoryMessage
    | EventsTriggeredMessage
    | QueueUpdateMessage
    | TriggerRulesLoadMessage
    | TriggerRulesLoadLabelsMessage
    | TriggerRulesUpdateMessage
    | TriggerRulesCreateMessage
    | TriggerRulesCreateLabelMessage
    | TriggerRulesDeleteMessage;

/** Messages the client receives (alias of WebSocketServerMessage). */
export type WebSocketIncomingMessage = WebSocketServerMessage;

/** Messages the client sends (alias of WebSocketClientMessage). */
export type WebSocketOutgoingMessage = WebSocketClientMessage;
