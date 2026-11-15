import { _decorator, Component, screen, Size } from 'cc';
const { ccclass } = _decorator;

/** Match the desktop engine frame to its full-window host, including input coordinates. */
@ccclass('WebViewport')
export class WebViewport extends Component {
    onEnable(): void {
        if (
            typeof window === 'undefined' ||
            typeof document === 'undefined' ||
            !document.getElementById('GameDiv')
        )
            return;
        window.addEventListener('resize', this.resize);
        this.resize();
    }
    onDisable(): void {
        if (typeof window !== 'undefined') window.removeEventListener('resize', this.resize);
    }
    private resize = () => {
        const dpr = screen.devicePixelRatio;
        screen.windowSize = new Size(window.innerWidth * dpr, window.innerHeight * dpr);
    };
}
