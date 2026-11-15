export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';
export type ButtonState = 'normal' | 'hover' | 'pressed' | 'disabled' | 'focus';
export interface ButtonInputState {
    enabled: boolean;
    down: boolean;
    inside: boolean;
    hovered: boolean;
    keyboardFocus: boolean;
}
export function buttonState(input: ButtonInputState): ButtonState {
    if (!input.enabled) return 'disabled';
    if (input.down && input.inside) return 'pressed';
    if (input.hovered) return 'hover';
    return input.keyboardFocus ? 'focus' : 'normal';
}
export function buttonColors(
    theme: any,
    variant: ButtonVariant,
    state: ButtonState,
    darkSurface = false
) {
    const style = theme.button,
        palette = style.variants[variant];
    if (darkSurface && state === 'disabled')
        return {
            fill: style.darkDisabledFill,
            line: style.darkDisabledLine,
            text: style.darkDisabledText,
            fillAlpha: variant === 'quiet' ? 0 : 255,
        };
    if (darkSurface && variant === 'quiet')
        return {
            fill: state === 'pressed' ? style.darkQuietPressed : style.darkQuietHover,
            line: style.darkDisabledLine,
            text: style.darkQuietText ?? theme.colors.paper,
            fillAlpha: state === 'normal' || state === 'focus' ? 0 : 255,
        };
    return state === 'disabled'
        ? {
              fill: style.disabledFill,
              line: style.disabledLine,
              text: style.disabledText,
              fillAlpha: variant === 'quiet' ? 0 : 255,
          }
        : {
              fill: palette[state === 'pressed' ? 'pressed' : state === 'hover' ? 'hover' : 'fill'],
              line: state === 'hover' || state === 'pressed' ? palette.activeLine : palette.line,
              text: palette.text,
              fillAlpha: variant === 'quiet' && (state === 'normal' || state === 'focus') ? 0 : 255,
          };
}
