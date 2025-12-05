import { RulesManager } from '../../src/js/settings/modules/rules_manager.js';
import { AppSettings } from '../../src/js/types.js'; // Ensure types are available if needed or mock

// Mock Chrome API
global.chrome = {
    storage: {
        sync: {
            get: jest.fn().mockResolvedValue({}),
            set: jest.fn().mockResolvedValue(undefined),
        },
        local: {
            get: jest.fn().mockResolvedValue({}),
        },
        onChanged: {
            addListener: jest.fn()
        }
    },
    runtime: {
        sendMessage: jest.fn().mockResolvedValue({}),
        getURL: jest.fn(),
    }
} as any;

describe('RulesManager', () => {
    let rulesManager: RulesManager;
    let mockShowToast: jest.Mock;

    beforeEach(() => {
        // Setup DOM
        document.body.innerHTML = `
            <tbody id="rules-tbody"></tbody>
            <tbody id="hiding-rules-tbody"></tbody>
            <input id="add-heuristic-keyword-input" />
            <div id="malware-list-status"></div>
            <div id="youtube-list-status"></div>
            <div id="tracker-list-status"></div>
            <div id="bundled-lists-container"></div> 
        `;

        mockShowToast = jest.fn();
        const mockSettings: Partial<AppSettings> = {
            enabledStaticRulesets: [],
            customHidingRules: {},
            heuristicKeywords: [],
            disabledSites: [],
            // Add other required settings as empty logic handles them
        };

        rulesManager = new RulesManager(mockSettings as AppSettings, mockShowToast);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('should toggle static ruleset and save to storage', async () => {
        // Mock storage get to return empty list
        (chrome.storage.sync.get as jest.Mock).mockResolvedValue({ enabledStaticRulesets: [] });

        await rulesManager.toggleStaticRuleset('test-ruleset', true);

        expect(chrome.storage.sync.set).toHaveBeenCalledWith({
            enabledStaticRulesets: ['test-ruleset']
        });
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'APPLY_ALL_RULES' });
    });

    test('should remove ruleset when toggled off', async () => {
        // Mock storage get to return existing list
        (chrome.storage.sync.get as jest.Mock).mockResolvedValue({ enabledStaticRulesets: ['test-ruleset', 'other'] });

        await rulesManager.toggleStaticRuleset('test-ruleset', false);

        expect(chrome.storage.sync.set).toHaveBeenCalledWith({
            enabledStaticRulesets: ['other']
        });
    });
});
