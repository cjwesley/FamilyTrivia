import '@servicenow/sdk/global'

declare global {
    namespace Now {
        namespace Internal {
            interface Keys extends KeysRegistry {
                explicit: {
                    bom_json: {
                        table: 'sys_module'
                        id: 'b8d6339fbc6b4d2eb6f0dd6dec430b34'
                    }
                    package_json: {
                        table: 'sys_module'
                        id: 'a689d4b97a57454d9491168eba2de5a6'
                    }
                }
            }
        }
    }
}
