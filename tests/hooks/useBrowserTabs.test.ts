import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { classifyUrl, useBrowserTabs } from '../../hooks/useBrowserTabs';

describe('classifyUrl', () => {
    it('classifies blank/empty as blank', () => {
        expect(classifyUrl('')).toBe('blank');
        expect(classifyUrl('   ')).toBe('blank');
        expect(classifyUrl('about:blank')).toBe('blank');
        expect(classifyUrl('echelon:home')).toBe('blank');
    });

    it('classifies .i2p hosts as eepsite (with or without scheme)', () => {
        expect(classifyUrl('example.i2p')).toBe('eepsite');
        expect(classifyUrl('http://example.i2p/')).toBe('eepsite');
        expect(classifyUrl('https://example.i2p')).toBe('eepsite');
        expect(classifyUrl('xyz.b32.i2p/page')).toBe('eepsite');
        expect(classifyUrl('notbob.i2p')).toBe('eepsite');
    });

    it('classifies http/https with non-i2p host as clearnet', () => {
        expect(classifyUrl('https://duckduckgo.com')).toBe('clearnet');
        expect(classifyUrl('http://example.com/page')).toBe('clearnet');
        expect(classifyUrl('https://en.wikipedia.org/wiki/I2P')).toBe('clearnet');
    });

    it('classifies bare hostnames with TLD as clearnet', () => {
        expect(classifyUrl('example.com')).toBe('clearnet');
        expect(classifyUrl('news.ycombinator.com')).toBe('clearnet');
    });

    it('classifies single-word free text as search', () => {
        expect(classifyUrl('privacy')).toBe('search');
        expect(classifyUrl('how to use i2p')).toBe('search');
    });

    it('case-insensitive', () => {
        expect(classifyUrl('EXAMPLE.I2P')).toBe('eepsite');
        expect(classifyUrl('HTTPS://Example.com')).toBe('clearnet');
    });
});

describe('useBrowserTabs', () => {
    it('starts with one blank tab', () => {
        const { result } = renderHook(() => useBrowserTabs());
        expect(result.current.tabs).toHaveLength(1);
        expect(result.current.tabs[0].kind).toBe('blank');
        expect(result.current.activeTabId).toBe(result.current.tabs[0].id);
        expect(result.current.activeTab.title).toBe('New Tab');
    });

    it('starts with the initial URL navigated when provided', () => {
        const { result } = renderHook(() => useBrowserTabs('example.i2p'));
        expect(result.current.tabs).toHaveLength(1);
        expect(result.current.tabs[0].kind).toBe('eepsite');
        expect(result.current.tabs[0].history).toEqual(['example.i2p']);
        expect(result.current.tabs[0].status).toBe('loading');
    });

    describe('openTab', () => {
        it('appends a new blank tab and switches focus', () => {
            const { result } = renderHook(() => useBrowserTabs());
            const firstId = result.current.activeTabId;
            let newId: number = -1;
            act(() => {
                newId = result.current.openTab();
            });
            expect(result.current.tabs).toHaveLength(2);
            expect(result.current.activeTabId).toBe(newId);
            expect(result.current.activeTabId).not.toBe(firstId);
            expect(result.current.activeTab.kind).toBe('blank');
        });

        it('opens with a URL when provided', () => {
            const { result } = renderHook(() => useBrowserTabs());
            act(() => {
                result.current.openTab('notbob.i2p');
            });
            expect(result.current.activeTab.history).toEqual(['notbob.i2p']);
            expect(result.current.activeTab.kind).toBe('eepsite');
        });

        it('refuses to open more than the cap (12)', () => {
            const { result } = renderHook(() => useBrowserTabs());
            for (let i = 0; i < 20; i++) {
                act(() => {
                    result.current.openTab();
                });
            }
            expect(result.current.tabs.length).toBeLessThanOrEqual(12);
        });
    });

    describe('navigate', () => {
        it('appends URL to history and updates kind', () => {
            const { result } = renderHook(() => useBrowserTabs());
            act(() => {
                result.current.navigate('example.i2p');
            });
            expect(result.current.activeTab.history).toEqual(['echelon:home', 'example.i2p']);
            expect(result.current.activeTab.historyIndex).toBe(1);
            expect(result.current.activeTab.kind).toBe('eepsite');
            expect(result.current.activeTab.status).toBe('loading');
        });

        it('truncates forward history when navigating from middle of stack', () => {
            const { result } = renderHook(() => useBrowserTabs());
            act(() => {
                result.current.navigate('a.i2p');
            });
            act(() => {
                result.current.navigate('b.i2p');
            });
            act(() => {
                result.current.navigate('c.i2p');
            });
            // a.i2p, b.i2p, c.i2p (history index = 3, plus the leading echelon:home)
            expect(result.current.activeTab.historyIndex).toBe(3);
            act(() => {
                result.current.goBack();
            });
            act(() => {
                result.current.goBack();
            });
            // now at a.i2p (index 1)
            expect(result.current.activeTab.history[result.current.activeTab.historyIndex]).toBe('a.i2p');

            act(() => {
                result.current.navigate('d.i2p');
            });
            // history should be: echelon:home, a.i2p, d.i2p (no b/c)
            expect(result.current.activeTab.history).toEqual(['echelon:home', 'a.i2p', 'd.i2p']);
            expect(result.current.activeTab.historyIndex).toBe(2);
        });

        it('clears prior error state on new navigation', () => {
            const { result } = renderHook(() => useBrowserTabs());
            act(() => {
                result.current.navigate('a.i2p');
            });
            act(() => {
                result.current.markActiveTabError('tunnel-timeout');
            });
            expect(result.current.activeTab.errorReason).toBe('tunnel-timeout');
            act(() => {
                result.current.navigate('b.i2p');
            });
            expect(result.current.activeTab.errorReason).toBeUndefined();
            expect(result.current.activeTab.kind).toBe('eepsite');
        });

        it('ignores empty navigation', () => {
            const { result } = renderHook(() => useBrowserTabs());
            const initialHistoryLen = result.current.activeTab.history.length;
            act(() => {
                result.current.navigate('   ');
            });
            expect(result.current.activeTab.history.length).toBe(initialHistoryLen);
        });
    });

    describe('goBack / goForward', () => {
        it('canGoBack is false at start', () => {
            const { result } = renderHook(() => useBrowserTabs());
            expect(result.current.canGoBack).toBe(false);
        });

        it('navigates backward and forward correctly', () => {
            const { result } = renderHook(() => useBrowserTabs());
            act(() => {
                result.current.navigate('a.i2p');
            });
            act(() => {
                result.current.navigate('b.i2p');
            });
            expect(result.current.canGoBack).toBe(true);
            expect(result.current.canGoForward).toBe(false);

            act(() => {
                result.current.goBack();
            });
            expect(result.current.activeTab.history[result.current.activeTab.historyIndex]).toBe('a.i2p');
            expect(result.current.canGoBack).toBe(true);
            expect(result.current.canGoForward).toBe(true);

            act(() => {
                result.current.goForward();
            });
            expect(result.current.activeTab.history[result.current.activeTab.historyIndex]).toBe('b.i2p');
        });

        it('no-ops at boundaries', () => {
            const { result } = renderHook(() => useBrowserTabs());
            act(() => {
                result.current.goBack();
            }); // already at start
            expect(result.current.activeTab.historyIndex).toBe(0);
            act(() => {
                result.current.goForward();
            }); // already at end
            expect(result.current.activeTab.historyIndex).toBe(0);
        });
    });

    describe('closeTab', () => {
        it('closes a non-active tab and keeps active focus', () => {
            const { result } = renderHook(() => useBrowserTabs());
            const firstId = result.current.activeTabId;
            let secondId: number = -1;
            act(() => {
                secondId = result.current.openTab();
            });
            expect(result.current.activeTabId).toBe(secondId);
            act(() => {
                result.current.switchTab(firstId);
            });
            expect(result.current.activeTabId).toBe(firstId);
            act(() => {
                result.current.closeTab(secondId);
            });
            expect(result.current.tabs).toHaveLength(1);
            expect(result.current.activeTabId).toBe(firstId);
        });

        it('closes the active tab and falls back to a sibling', () => {
            const { result } = renderHook(() => useBrowserTabs());
            const firstId = result.current.activeTabId;
            let secondId: number = -1;
            act(() => {
                secondId = result.current.openTab();
            });
            expect(result.current.activeTabId).toBe(secondId);
            act(() => {
                result.current.closeTab(secondId);
            });
            expect(result.current.tabs).toHaveLength(1);
            expect(result.current.activeTabId).toBe(firstId);
        });

        it('closing the only tab opens a fresh blank one (never leaves zero tabs)', () => {
            const { result } = renderHook(() => useBrowserTabs());
            const id = result.current.activeTabId;
            act(() => {
                result.current.closeTab(id);
            });
            expect(result.current.tabs).toHaveLength(1);
            expect(result.current.tabs[0].kind).toBe('blank');
        });
    });

    describe('error states', () => {
        it('markActiveTabError sets reason + message + status', () => {
            const { result } = renderHook(() => useBrowserTabs());
            act(() => {
                result.current.navigate('example.i2p');
            });
            act(() => {
                result.current.markActiveTabError('dns-failed', 'eepsite address not in NetDB');
            });
            expect(result.current.activeTab.status).toBe('error');
            expect(result.current.activeTab.kind).toBe('error');
            expect(result.current.activeTab.errorReason).toBe('dns-failed');
            expect(result.current.activeTab.errorMessage).toBe('eepsite address not in NetDB');
        });

        it('markActiveTabLoaded clears errors and updates title', () => {
            const { result } = renderHook(() => useBrowserTabs());
            act(() => {
                result.current.navigate('example.i2p');
            });
            act(() => {
                result.current.markActiveTabError('tunnel-timeout');
            });
            act(() => {
                result.current.markActiveTabLoaded('Example Eepsite');
            });
            expect(result.current.activeTab.status).toBe('loaded');
            expect(result.current.activeTab.title).toBe('Example Eepsite');
            expect(result.current.activeTab.errorReason).toBeUndefined();
        });
    });

    describe('switchTab', () => {
        it('changes active tab', () => {
            const { result } = renderHook(() => useBrowserTabs());
            const firstId = result.current.activeTabId;
            let newId: number = -1;
            act(() => {
                newId = result.current.openTab();
            });
            act(() => {
                result.current.switchTab(firstId);
            });
            expect(result.current.activeTabId).toBe(firstId);
            act(() => {
                result.current.switchTab(newId);
            });
            expect(result.current.activeTabId).toBe(newId);
        });
    });

    it('multiple tabs maintain independent histories', () => {
        const { result } = renderHook(() => useBrowserTabs());
        act(() => {
            result.current.navigate('a.i2p');
        });
        let secondId: number = -1;
        act(() => {
            secondId = result.current.openTab();
        });
        act(() => {
            result.current.navigate('b.i2p');
        });
        // tab 1: ['echelon:home', 'a.i2p'], tab 2: ['echelon:home', 'b.i2p']
        const tab1 = result.current.tabs.find(t => t.id !== secondId)!;
        const tab2 = result.current.tabs.find(t => t.id === secondId)!;
        expect(tab1.history).toEqual(['echelon:home', 'a.i2p']);
        expect(tab2.history).toEqual(['echelon:home', 'b.i2p']);
    });
});
