/// <reference types="pixi.js" />
declare module 'pixi-scrollbox'

declare namespace LIST {
    export class ListOptions {
        width: number
        height: number
        fade?: boolean
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
    export default class List extends PIXI.Container {
        box: any
        /**
         * Creates an instance of List.
         * @param { Number } cornerRadius
         * @param { Number } scrollbarSize
         * @param { Boolean } clampWheel
         * @param { Boolean } dragScroll
         * @param { Boolean } fadeScrollbar
         * @param { Number } fadeScrollbarTime
         * @param { String } fadeScrollboxEase
         * @param { Number } fadeScrollboxWait
         * @param { String } overflowX
         * @param { String } overflowY
         * @param { Boolean } passiveWheel
         * @param { Number } scrollbarBackground
         * @param { Number } scrollbarBackgroundAlpha
         * @param { Number } scrollbarForeground
         * @param { Number } scrollbarForegroundAlpha
         * @param { Number } scrollbarOffsetHorizontal
         * @param { Number } scrollbarOffsetVertical
         * @param { Boolean } stopPropagation
         * @memberof List
         */
        constructor(options: LIST.ListOptions)
        push(item: any): void
    }
}