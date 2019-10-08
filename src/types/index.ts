declare module 'pixi-scrollbox'

namespace LIST {
    export class ListOptions {
        width: number
        height: number
        cornerRadius?: number
        scrollbarSize?: number
        clampWheel?: boolean
        dragScroll?: boolean
        fadeScrollbar?: boolean
        fadeScrollbarTime?: number
        fadeScrollboxEase?: string
        fadeScrollboxWait?: number
        overflowX?: string
        overflowY?: string
        passiveWheel?: boolean
        scrollbarBackground?: number
        scrollbarBackgroundAlpha?: number
        scrollbarForeground?: number
        scrollbarForegroundAlpha?: number
        scrollbarOffsetHorizontal?: number
        scrollbarOffsetVertical?: number
        stopPropagation?: boolean
    }
}

declare module '@amoy/list' {
    export default class List extends LIST.ListOptions {}
}