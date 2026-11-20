/** Current-rule disclosure never migrates or resets a saved expedition. */
export function rulesNotice(currentRuleset: string, newGameRuleset: string) {
    const legacy = currentRuleset === 'tutorial-v1';
    const upgrade = legacy && newGameRuleset === 'stamina-v1';
    return {
        caption: legacy
            ? upgrade
                ? '旧规则探索 · 重开可启用体力'
                : '旧规则探索 · 查看规则说明'
            : '',
        help: legacy
            ? '当前探索沿用旧规则：出牌消耗物资，物资也占负重。\n旧进度已保留，你可以继续完成这一局。\n\n' +
              (upgrade
                  ? '要启用体力系统，请选择「重开」并确认开始新探索；当前探索进度届时会重置。\n\n'
                  : '') +
              '攻击牌选择敌人或拖向敌人；其余牌点击使用。\n暂存物品不能参战，营地可以整理出战牌组。\n教学失败仍为第 1 天；通关后通过关键日志继续正式探索。'
            : '',
        restart: upgrade ? '\n\n新探索将启用体力系统：出牌使用每回合体力，物资点不再占负重。' : '',
    };
}
