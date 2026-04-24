flowchart TD
    entrypointA[fa:fa-link Chaster Webhooks] --> dispatcher
    entrypointB[fa:fa-server Sensor Alarms] --> dispatcher(Dispatcher)

    dispatcher --> |dispatch events| searchTriggerRules{Search TriggerRules}
    searchTriggerRules -->|No TriggerRules| NoTriggerRules[fa:fa-cancel Exit]
    searchTriggerRules -->|Found TriggerRules| isMagicOperator[Contain MagicOperators?]

    isMagicOperator --> hasMagicOperator[Yes]
    isMagicOperator --> hasNoMagicOperator[no]

    hasMagicOperator --> |parse magic operators|addToEventQueue[Add into Queue]
    hasNoMagicOperator --> addToEventQueue[Add into Queue]

    addToEventQueue --> sendWSNotif[Notify users with WS]
    addToEventQueue --> applyActions[Apply TriggerRules Actions]
    addToEventQueue --> logEvents[Log Events inside the current PlaySession]

    applyActions --> permanent[Apply Action forever]
    applyActions --> actionWithDuration[Apply Action for X seconds]

    actionWithDuration --> reverseAction[Reverse Action]

