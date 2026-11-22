/** Current-rule disclosure never migrates or resets a saved expedition. */
export function rulesNotice(currentRuleset: string, newGameRuleset: string, fieldUpdate = false, destination = '退潮盐原') {
    if (fieldUpdate && destination !== '退潮盐原')
        return {
            caption: `旧版探索 · 重开可去${destination}`,
            help: `当前进度继续使用原地图。确认重开后进入${destination}。\n\n`,
            restart: `\n\n新探索将从${destination}开始。`,
        };
    if (currentRuleset === 'stamina-v1' && fieldUpdate)
        return {
            caption: '旧版探索 · 重开可进入盐原',
            help: '这局沿用旧版行囊和营地规则。选择「重开」并确认后，会从第 1 天进入退潮盐原。\n\n',
            restart: '\n\n新探索将从退潮盐原开始，以基础牌组进入战斗，再在途中发现新牌。',
        };
    const legacy = currentRuleset === 'tutorial-v1';
    const upgrade = legacy && newGameRuleset === 'stamina-v1';
    return {
        caption: legacy
            ? upgrade
                ? '旧规则探索 · 重开可启用体力'
                : '旧规则探索 · 查看规则说明'
            : '',
        help: legacy
            ? '教学探索出牌消耗物资。\n当前进度可直接继续。\n\n' +
              (upgrade
                  ? '要启用体力系统，请选择「重开」并确认开始新探索；当前探索进度届时会重置。\n\n'
                  : '') +
              '攻击牌选择敌人或拖向敌人，其余牌点击使用。\n营地可以整理出战牌组。血量归零立即探索失败。\n教学失败仍为第 1 天，通关后通过关键日志继续正式探索。'
            : '',
        restart: upgrade ? '\n\n新探索出牌使用每回合体力。' : '',
    };
}
