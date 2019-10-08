import { Graphics, Container } from 'pixi.js'
import { Scrollbox } from 'pixi-scrollbox'

export default class List extends Container {
    public box: typeof Scrollbox

    constructor({
        width,
        height,
        cornerRadius = 0,
        scrollbarSize = 5,
        ...rest
    }: LIST.ListOptions) {
        super()

        const mask = this.createGraphics(0, 0, width, height, cornerRadius)
        this.mask = mask

        this.box = new Scrollbox({
            boxWidth: width,
            boxHeight: height,
            overflowX: 'hidden',
            overflowY: 'auto',
            scrollbarSize,
            ...rest,
        })

        this.addChild(this.box)
    }

    private createGraphics(x: number, y: number, width: number, height: number, radius: number = 0, color: number = 0xffffff) {
        const graphic = new Graphics()
        graphic.beginFill(color)
        graphic.drawRoundedRect(x, y, width, height, radius)
        graphic.endFill()
        return graphic
    }

    public push(item: any) {
        this.box.content.addChild(item)
    }
}
