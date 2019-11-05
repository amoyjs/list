import * as PIXI from 'pixi.js';
import { Container, VERSION, Rectangle, Point, Graphics } from 'pixi.js';

/*! *****************************************************************************
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at http://www.apache.org/licenses/LICENSE-2.0

THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
MERCHANTABLITY OR NON-INFRINGEMENT.

See the Apache Version 2.0 License for specific language governing permissions
and limitations under the License.
***************************************************************************** */
/* global Reflect, Promise */

var extendStatics = function(d, b) {
    extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return extendStatics(d, b);
};

function __extends(d, b) {
    extendStatics(d, b);
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
}

var __assign = function() {
    __assign = Object.assign || function __assign(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};

function __rest(s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
}

/**
 * @typedef ViewportTouch
 * @property {number} id
 * @property {PIXI.Point} last
*/

/**
 * handles all input for Viewport
 * @private
 */
class InputManager
{
    constructor(viewport)
    {
        this.viewport = viewport;

        /**
         * list of active touches on viewport
         * @type {ViewportTouch[]}
         */
        this.touches = [];
        this.addListeners();
    }

    /**
     * add input listeners
     * @private
     */
    addListeners()
    {
        this.viewport.interactive = true;
        if (!this.viewport.forceHitArea)
        {
            this.viewport.hitArea = new Rectangle(0, 0, this.viewport.worldWidth, this.viewport.worldHeight);
        }
        this.viewport.on('pointerdown', this.down, this);
        this.viewport.on('pointermove', this.move, this);
        this.viewport.on('pointerup', this.up, this);
        this.viewport.on('pointerupoutside', this.up, this);
        this.viewport.on('pointercancel', this.up, this);
        this.viewport.on('pointerout', this.up, this);
        this.wheelFunction = (e) => this.handleWheel(e);
        this.viewport.options.divWheel.addEventListener('wheel', this.wheelFunction, { passive: this.viewport.options.passiveWheel });
        this.isMouseDown = false;
    }

    /**
     * removes all event listeners from viewport
     * (useful for cleanup of wheel when removing viewport)
     */
    destroy()
    {
        this.viewport.options.divWheel.removeEventListener('wheel', this.wheelFunction);
    }

    /**
     * handle down events for viewport
     * @param {PIXI.interaction.InteractionEvent} event
     */
    down(event)
    {
        if (this.viewport.pause || !this.viewport.worldVisible)
        {
            return
        }
        if (event.data.pointerType === 'mouse')
        {
            this.isMouseDown = true;
        }
        else if (!this.get(event.data.pointerId))
        {
            this.touches.push({ id: event.data.pointerId, last: null });
        }
        if (this.count() === 1)
        {
            this.last = event.data.global.clone();

            // clicked event does not fire if viewport is decelerating or bouncing
            const decelerate = this.viewport.plugins.get('decelerate');
            const bounce = this.viewport.plugins.get('bounce');
            if ((!decelerate || !decelerate.isActive()) && (!bounce || !bounce.isActive()))
            {
                this.clickedAvailable = true;
            }
            else
            {
                this.clickedAvailable = false;
            }
        }
        else
        {
            this.clickedAvailable = false;
        }

        const stop = this.viewport.plugins.down(event);
        if (stop && this.viewport.options.stopPropagation)
        {
            event.stopPropagation();
        }
    }

    /**
     * @param {number} change
     * @returns whether change exceeds threshold
     */
    checkThreshold(change)
    {
        if (Math.abs(change) >= this.viewport.threshold)
        {
            return true
        }
        return false
    }

    /**
     * handle move events for viewport
     * @param {PIXI.interaction.InteractionEvent} event
     */
    move(event)
    {
        if (this.viewport.pause || !this.viewport.worldVisible)
        {
            return
        }

        const stop = this.viewport.plugins.move(event);

        if (this.clickedAvailable)
        {
            const distX = event.data.global.x - this.last.x;
            const distY = event.data.global.y - this.last.y;
            if (this.checkThreshold(distX) || this.checkThreshold(distY))
            {
                this.clickedAvailable = false;
            }
        }

        if (stop && this.viewport.options.stopPropagation)
        {
            event.stopPropagation();
        }
    }

    /**
     * handle up events for viewport
     * @param {PIXI.interaction.InteractionEvent} event
     */
    up(event)
    {
        if (this.viewport.pause || !this.viewport.worldVisible)
        {
            return
        }

        if (event.data.pointerType === 'mouse')
        {
            this.isMouseDown = false;
        }

        if (event.data.pointerType !== 'mouse')
        {
            this.remove(event.data.pointerId);
        }

        const stop = this.viewport.plugins.up(event);

        if (this.clickedAvailable && this.count() === 0)
        {
            this.viewport.emit('clicked', { screen: this.last, world: this.viewport.toWorld(this.last), viewport: this });
            this.clickedAvailable = false;
        }

        if (stop && this.viewport.options.stopPropagation)
        {
            event.stopPropagation();
        }
    }

    /**
     * gets pointer position if this.interaction is set
     * @param {WheelEvent} event
     * @return {PIXI.Point}
     */
    getPointerPosition(event)
    {
        let point = new Point();
        if (this.viewport.options.interaction)
        {
            this.viewport.options.interaction.mapPositionToPoint(point, event.clientX, event.clientY);
        }
        else
        {
            point.x = event.clientX;
            point.y = event.clientY;
        }
        return point
    }

    /**
     * handle wheel events
     * @param {WheelEvent} event
     */
    handleWheel(event)
    {
        if (this.viewport.pause || !this.viewport.worldVisible)
        {
            return
        }

        // only handle wheel events where the mouse is over the viewport
        const point = this.viewport.toLocal(this.getPointerPosition(event));
        if (this.viewport.left <= point.x && point.x <= this.viewport.right && this.viewport.top <= point.y && point.y <= this.viewport.bottom)
        {
            const stop = this.viewport.plugins.wheel(event);
            if (stop)
            {
                event.preventDefault();
            }
        }
    }

    pause()
    {
        this.touches = [];
        this.isMouseDown = false;
    }

    /**
     * get touch by id
     * @param {number} id
     * @return {ViewportTouch}
     */
    get(id)
    {
        for (let touch of this.touches)
        {
            if (touch.id === id)
            {
                return touch
            }
        }
        return null
    }

    /**
     * remove touch by number
     * @param {number} id
     */
    remove(id)
    {
        for (let i = 0; i < this.touches.length; i++)
        {
            if (this.touches[i].id === id)
            {
                this.touches.splice(i, 1);
                return
            }
        }
    }

    /**
     * @returns {number} count of mouse/touch pointers that are down on the viewport
     */
    count()
    {
        return (this.isMouseDown ? 1 : 0) + this.touches.length
    }
}

const PLUGIN_ORDER = ['drag', 'pinch', 'wheel', 'follow', 'mouse-edges', 'decelerate', 'bounce', 'snap-zoom', 'clamp-zoom', 'snap', 'clamp'];

/**
 * Use this to access current plugins or add user-defined plugins
 */
class PluginManager
{
    /**
     * instantiated by Viewport
     * @param {Viewport} viewport
     */
    constructor(viewport)
    {
        this.viewport = viewport;
        this.list = [];
        this.plugins = {};
    }

    /**
     * Inserts a named plugin or a user plugin into the viewport
     * default plugin order: 'drag', 'pinch', 'wheel', 'follow', 'mouse-edges', 'decelerate', 'bounce', 'snap-zoom', 'clamp-zoom', 'snap', 'clamp'
     * @param {string} name of plugin
     * @param {Plugin} plugin - instantiated Plugin class
     * @param {number} index to insert userPlugin (otherwise inserts it at the end)
     */
    add(name, plugin, index = PLUGIN_ORDER.length)
    {
        this.plugins[name] = plugin;
        const current = PLUGIN_ORDER.indexOf(name);
        if (current !== -1)
        {
            PLUGIN_ORDER.splice(current, 1);
        }
        PLUGIN_ORDER.splice(index, 0, name);
        this.sort();
    }

    /**
     * get plugin
     * @param {string} name of plugin
     * @return {Plugin}
     */
    get(name)
    {
        return this.plugins[name]
    }

    /**
     * update all active plugins
     * @private
     * @param {number} elapsed type in milliseconds since last update
     */
    update(elapsed)
    {
        for (let plugin of this.list)
        {
            plugin.update(elapsed);
        }
    }

    /**
     * resize all active plugins
     * @private
     */
    resize()
    {
        for (let plugin of this.list)
        {
            plugin.resize();
        }
    }

    /**
     * clamps and resets bounce and decelerate (as needed) after manually moving viewport
     */
    reset()
    {
        if (this.plugins['bounce'])
        {
            this.plugins['bounce'].reset();
            this.plugins['bounce'].bounce();
        }
        if (this.plugins['decelerate'])
        {
            this.plugins['decelerate'].reset();
        }
        if (this.plugins['snap'])
        {
            this.plugins['snap'].reset();
        }
        if (this.plugins['clamp'])
        {
            this.plugins['clamp'].update();
        }
        if (this.plugins['clamp-zoom'])
        {
            this.plugins['clamp-zoom'].clamp();
        }
    }

    /**
     * removes installed plugin
     * @param {string} name of plugin (e.g., 'drag', 'pinch')
     */
    remove(name)
    {
        if (this.plugins[name])
        {
            this.plugins[name] = null;
            this.viewport.emit(name + '-remove');
            this.sort();
        }
    }

    /**
     * pause plugin
     * @param {string} name of plugin (e.g., 'drag', 'pinch')
     */
    pause(name)
    {
        if (this.plugins[name])
        {
            this.plugins[name].pause();
        }
    }

    /**
     * resume plugin
     * @param {string} name of plugin (e.g., 'drag', 'pinch')
     */
    resume(name)
    {
        if (this.plugins[name])
        {
            this.plugins[name].resume();
        }
    }

    /**
     * sort plugins according to PLUGIN_ORDER
     * @private
     */
    sort()
    {
        this.list = [];
        for (let plugin of PLUGIN_ORDER)
        {
            if (this.plugins[plugin])
            {
                this.list.push(this.plugins[plugin]);
            }
        }
    }

    /**
     * handle down for all plugins
     * @private
     * @param {PIXI.interaction.InteractionEvent} event
     * @returns {boolean}
     */
    down(event)
    {
        let stop = false;
        for (let plugin of this.list)
        {
            if (plugin.down(event))
            {
                stop = true;
            }
        }
        return stop
    }

    /**
     * handle move for all plugins
     * @private
     * @param {PIXI.interaction.InteractionEvent} event
     * @returns {boolean}
     */
    move(event)
    {
        let stop = false;
        for (let plugin of this.viewport.plugins.list)
        {
            if (plugin.move(event))
            {
                stop = true;
            }
        }
        return stop
    }

    /**
     * handle up for all plugins
     * @private
     * @param {PIXI.interaction.InteractionEvent} event
     * @returns {boolean}
     */
    up(event)
    {
        let stop = false;
        for (let plugin of this.list)
        {
            if (plugin.up(event))
            {
                stop = true;
            }
        }
        return stop
    }

    /**
     * handle wheel event for all plugins
     * @private
     * @param {WheelEvent} event
     * @returns {boolean}
     */
    wheel(e)
    {
        let result = false;
        for (let plugin of this.list)
        {
            if (plugin.wheel(e))
            {
                result = true;
            }
        }
        return result
    }
}

/**
 * derive this class to create user-defined plugins
 */
class Plugin
{
    /**
     * @param {Viewport} parent
     */
    constructor(parent)
    {
        this.parent = parent;
        this.paused = false;
    }

    /** called when plugin is removed */
    destroy() {}

    /**
     * handler for pointerdown PIXI event
     * @param {PIXI.interaction.InteractionEvent} event
     * @returns {boolean}
     */
    down()
    {
        return false
    }

    /**
     * handler for pointermove PIXI event
     * @param {PIXI.interaction.InteractionEvent} event
     * @returns {boolean}
     */
    move()
    {
        return false
    }

    /**
     * handler for pointerup PIXI event
     * @param {PIXI.interaction.InteractionEvent} event
     * @returns {boolean}
     */
    up()
    {
        return false
    }

    /**
     * handler for wheel event on div
     * @param {WheelEvent} event
     * @returns {boolean}
     */
    wheel()
    {
        return false
    }

    /**
     * called on each tick
     * @param {number} elapsed time in millisecond since last update
     */
    update() { }

    /** called when the viewport is resized */
    resize() { }

    /** called when the viewport is manually moved */
    reset() { }

    /** pause the plugin */
    pause()
    {
        this.paused = true;
    }

    /** un-pause the plugin */
    resume()
    {
        this.paused = false;
    }
}

/**
 * @typedef {object} LastDrag
 * @property {number} x
 * @property {number} y
 * @property {PIXI.Point} parent
 */

/**
 * @typedef DragOptions
 * @property {string} [direction=all] direction to drag
 * @property {boolean} [wheel=true] use wheel to scroll in y direction(unless wheel plugin is active)
 * @property {number} [wheelScroll=1] number of pixels to scroll with each wheel spin
 * @property {boolean} [reverse] reverse the direction of the wheel scroll
 * @property {(boolean|string)} [clampWheel=false] clamp wheel(to avoid weird bounce with mouse wheel)
 * @property {string} [underflow=center] where to place world if too small for screen
 * @property {number} [factor=1] factor to multiply drag to increase the speed of movement
 * @property {string} [mouseButtons=all] changes which mouse buttons trigger drag, use: 'all', 'left', right' 'middle', or some combination, like, 'middle-right'; you may want to set viewport.options.disableOnContextMenu if you want to use right-click dragging
 */

const dragOptions = {
    direction: 'all',
    wheel: true,
    wheelScroll: 1,
    reverse: false,
    clampWheel: false,
    underflow: 'center',
    factor: 1,
    mouseButtons: 'all'
};

/**
 * @private
 */
class Drag extends Plugin
{
    /**
     * @param {Viewport} parent
     * @param {DragOptions} options
     */
    constructor(parent, options={})
    {
        super(parent);
        this.options = Object.assign({}, dragOptions, options);
        this.moved = false;
        this.reverse = this.options.reverse ? 1 : -1;
        this.xDirection = !this.options.direction || this.options.direction === 'all' || this.options.direction === 'x';
        this.yDirection = !this.options.direction || this.options.direction === 'all' || this.options.direction === 'y';

        this.parseUnderflow();
        this.mouseButtons(this.options.mouseButtons);
    }

    /**
     * initialize mousebuttons array
     * @param {string} buttons
     */
    mouseButtons(buttons)
    {
        if (!buttons || buttons === 'all')
        {
            this.mouse = [true, true, true];
        }
        else
        {
            this.mouse = [
                buttons.indexOf('left') === -1 ? false : true,
                buttons.indexOf('middle') === -1 ? false : true,
                buttons.indexOf('right') === -1 ? false : true
            ];
        }
    }

    parseUnderflow()
    {
        const clamp = this.options.underflow.toLowerCase();
        if (clamp === 'center')
        {
            this.underflowX = 0;
            this.underflowY = 0;
        }
        else
        {
            this.underflowX = (clamp.indexOf('left') !== -1) ? -1 : (clamp.indexOf('right') !== -1) ? 1 : 0;
            this.underflowY = (clamp.indexOf('top') !== -1) ? -1 : (clamp.indexOf('bottom') !== -1) ? 1 : 0;
        }
    }

    /**
     * @param {PIXI.interaction.InteractionEvent} event
     * @returns {boolean}
     */
    checkButtons(event)
    {
        const isMouse = event.data.pointerType === 'mouse';
        const count = this.parent.input.count();
        if ((count === 1) || (count > 1 && !this.parent.plugins.get('pinch')))
        {
            if (!isMouse || this.mouse[event.data.button])
            {
                return true
            }
        }
        return false
    }

    /**
     * @param {PIXI.interaction.InteractionEvent} event
     */
    down(event)
    {
        if (this.paused)
        {
            return
        }
        if (this.checkButtons(event))
        {
            this.last = { x: event.data.global.x, y: event.data.global.y };
            this.current = event.data.pointerId;
            return true
        }
        else
        {
            this.last = null;
        }
    }

    get active()
    {
        return this.moved
    }

    /**
     * @param {PIXI.interaction.InteractionEvent} event
     */
    move(event)
    {
        if (this.paused)
        {
            return
        }
        if (this.last && this.current === event.data.pointerId)
        {
            const x = event.data.global.x;
            const y = event.data.global.y;
            const count = this.parent.input.count();
            if (count === 1 || (count > 1 && !this.parent.plugins.get('pinch')))
            {
                const distX = x - this.last.x;
                const distY = y - this.last.y;
                if (this.moved || ((this.xDirection && this.parent.input.checkThreshold(distX)) || (this.yDirection && this.parent.input.checkThreshold(distY))))
                {
                    const newPoint = { x, y };
                    if (this.xDirection)
                    {
                        this.parent.x += (newPoint.x - this.last.x) * this.options.factor;
                    }
                    if (this.yDirection)
                    {
                        this.parent.y += (newPoint.y - this.last.y) * this.options.factor;
                    }
                    this.last = newPoint;
                    if (!this.moved)
                    {
                        this.parent.emit('drag-start', { screen: new Point(this.last.x, this.last.y), world: this.parent.toWorld(new Point(this.last.x, this.last.y)), viewport: this.parent});
                    }
                    this.moved = true;
                    this.parent.emit('moved', { viewport: this.parent, type: 'drag' });
                    return true
                }
            }
            else
            {
                this.moved = false;
            }
        }
    }

    /**
     * @param {PIXI.interaction.InteractionEvent} event
     * @returns {boolean}
     */
    up()
    {
        const touches = this.parent.input.touches;
        if (touches.length === 1)
        {
            const pointer = touches[0];
            if (pointer.last)
            {
                this.last = { x: pointer.last.x, y: pointer.last.y };
                this.current = pointer.id;
            }
            this.moved = false;
            return true
        }
        else if (this.last)
        {
            if (this.moved)
            {
                const screen = new Point(this.last.x, this.last.y);
                this.parent.emit('drag-end', {screen, world: this.parent.toWorld(screen), viewport: this.parent});
                this.last = null;
                this.moved = false;
                return true
            }
        }
    }

    /**
     * @param {WheelEvent} event
     * @returns {boolean}
     */
    wheel(event)
    {
        if (this.paused)
        {
            return
        }

        if (this.options.wheel)
        {
            const wheel = this.parent.plugins.get('wheel');
            if (!wheel)
            {
                if (this.xDirection)
                {
                    this.parent.x += event.deltaX * this.options.wheelScroll * this.reverse;
                }
                if (this.yDirection)
                {
                    this.parent.y += event.deltaY * this.options.wheelScroll * this.reverse;
                }
                if (this.options.clampWheel)
                {
                    this.clamp();
                }
                this.parent.emit('wheel-scroll', this.parent);
                this.parent.emit('moved', this.parent);
                if (!this.parent.options.passiveWheel)
                {
                    event.preventDefault();
                }
                return true
            }
        }
    }

    resume()
    {
        this.last = null;
        this.paused = false;
    }

    clamp()
    {
        const decelerate = this.parent.plugins.get('decelerate') || {};
        if (this.options.clampWheel !== 'y')
        {
            if (this.parent.screenWorldWidth < this.parent.screenWidth)
            {
                switch (this.underflowX)
                {
                    case -1:
                        this.parent.x = 0;
                        break
                    case 1:
                        this.parent.x = (this.parent.screenWidth - this.parent.screenWorldWidth);
                        break
                    default:
                        this.parent.x = (this.parent.screenWidth - this.parent.screenWorldWidth) / 2;
                }
            }
            else
            {
                if (this.parent.left < 0)
                {
                    this.parent.x = 0;
                    decelerate.x = 0;
                }
                else if (this.parent.right > this.parent.worldWidth)
                {
                    this.parent.x = -this.parent.worldWidth * this.parent.scale.x + this.parent.screenWidth;
                    decelerate.x = 0;
                }
            }
        }
        if (this.options.clampWheel !== 'x')
        {
            if (this.parent.screenWorldHeight < this.parent.screenHeight)
            {
                switch (this.underflowY)
                {
                    case -1:
                        this.parent.y = 0;
                        break
                    case 1:
                        this.parent.y = (this.parent.screenHeight - this.parent.screenWorldHeight);
                        break
                    default:
                        this.parent.y = (this.parent.screenHeight - this.parent.screenWorldHeight) / 2;
                }
            }
            else
            {
                if (this.parent.top < 0)
                {
                    this.parent.y = 0;
                    decelerate.y = 0;
                }
                if (this.parent.bottom > this.parent.worldHeight)
                {
                    this.parent.y = -this.parent.worldHeight * this.parent.scale.y + this.parent.screenHeight;
                    decelerate.y = 0;
                }
            }
        }
    }
}

/**
 * @typedef {object} PinchOptions
 * @property {boolean} [noDrag] disable two-finger dragging
 * @property {number} [percent=1.0] percent to modify pinch speed
 * @property {PIXI.Point} [center] place this point at center during zoom instead of center of two fingers
 */

const pinchOptions = {
    noDrag: false,
    percent: 1.0,
    center: null
};

class Pinch extends Plugin
{
    /**
     * @private
     * @param {Viewport} parent
     * @param {PinchOptions} [options]
     */
    constructor(parent, options={})
    {
        super(parent);
        this.options = Object.assign({}, pinchOptions, options);
    }

    down()
    {
        if (this.parent.input.count() >= 2)
        {
            this.active = true;
            return true
        }
    }

    move(e)
    {
        if (this.paused || !this.active)
        {
            return
        }

        const x = e.data.global.x;
        const y = e.data.global.y;

        const pointers = this.parent.input.touches;
        if (pointers.length >= 2)
        {
            const first = pointers[0];
            const second = pointers[1];
            const last = (first.last && second.last) ? Math.sqrt(Math.pow(second.last.x - first.last.x, 2) + Math.pow(second.last.y - first.last.y, 2)) : null;
            if (first.id === e.data.pointerId)
            {
                first.last = { x, y, data: e.data };
            }
            else if (second.id === e.data.pointerId)
            {
                second.last = { x, y, data: e.data };
            }
            if (last)
            {
                let oldPoint;
                const point = { x: first.last.x + (second.last.x - first.last.x) / 2, y: first.last.y + (second.last.y - first.last.y) / 2 };
                if (!this.options.center)
                {
                    oldPoint = this.parent.toLocal(point);
                }
                const dist = Math.sqrt(Math.pow(second.last.x - first.last.x, 2) + Math.pow(second.last.y - first.last.y, 2));
                const change = ((dist - last) / this.parent.screenWidth) * this.parent.scale.x * this.options.percent;
                this.parent.scale.x += change;
                this.parent.scale.y += change;
                this.parent.emit('zoomed', { viewport: this.parent, type: 'pinch' });
                const clamp = this.parent.plugins.get('clamp-zoom');
                if (clamp)
                {
                    clamp.clamp();
                }
                if (this.options.center)
                {
                    this.parent.moveCenter(this.options.center);
                }
                else
                {
                    const newPoint = this.parent.toGlobal(oldPoint);
                    this.parent.x += point.x - newPoint.x;
                    this.parent.y += point.y - newPoint.y;
                    this.parent.emit('moved', { viewport: this.parent, type: 'pinch' });
                }
                if (!this.options.noDrag && this.lastCenter)
                {
                    this.parent.x += point.x - this.lastCenter.x;
                    this.parent.y += point.y - this.lastCenter.y;
                    this.parent.emit('moved', { viewport: this.parent, type: 'pinch' });
                }
                this.lastCenter = point;
                this.moved = true;
            }
            else
            {
                if (!this.pinching)
                {
                    this.parent.emit('pinch-start', this.parent);
                    this.pinching = true;
                }
            }
            return true
        }
    }

    up()
    {
        if (this.pinching)
        {
            if (this.parent.input.touches.length <= 1)
            {
                this.active = false;
                this.lastCenter = null;
                this.pinching = false;
                this.moved = false;
                this.parent.emit('pinch-end', this.parent);
                return true
            }
        }
    }
}

/**
 * @typedef ClampOptions
 * @property {(number|boolean)} [left=false] clamp left; true = 0
 * @property {(number|boolean)} [right=false] clamp right; true = viewport.worldWidth
 * @property {(number|boolean)} [top=false] clamp top; true = 0
 * @property {(number|boolean)} [bottom=false] clamp bottom; true = viewport.worldHeight
 * @property {string} [direction] (all, x, or y) using clamps of [0, viewport.worldWidth/viewport.worldHeight]; replaces left/right/top/bottom if set
 * @property {string} [underflow=center] where to place world if too small for screen (e.g., top-right, center, none, bottomleft)
 */

const clampOptions =
{
    left: false,
    right: false,
    top: false,
    bottom: false,
    direction: null,
    underflow: 'center'
};

class Clamp extends Plugin
{
    /**
     * @private
     * @param {Viewport} parent
     * @param {ClampOptions} [options]
     */
    constructor(parent, options={})
    {
        super(parent);
        this.options = Object.assign({}, clampOptions, options);
        if (this.options.direction)
        {
            this.options.left = this.options.direction === 'x' || this.options.direction === 'all' ? true : null;
            this.options.right = this.options.direction === 'x' || this.options.direction === 'all' ? true : null;
            this.options.top = this.options.direction === 'y' || this.options.direction === 'all' ? true : null;
            this.options.bottom = this.options.direction === 'y' || this.options.direction === 'all' ? true : null;
        }
        this.parseUnderflow();
        this.update();
    }

    parseUnderflow()
    {
        const clamp = this.options.underflow.toLowerCase();
        if (clamp === 'none')
        {
            this.noUnderflow = true;
        }
        else if (clamp === 'center')
        {
            this.underflowX = this.underflowY = 0;
            this.noUnderflow = false;
        }
        else
        {
            this.underflowX = (clamp.indexOf('left') !== -1) ? -1 : (clamp.indexOf('right') !== -1) ? 1 : 0;
            this.underflowY = (clamp.indexOf('top') !== -1) ? -1 : (clamp.indexOf('bottom') !== -1) ? 1 : 0;
            this.noUnderflow = false;
        }
    }

    /**
     * handle move events
     * @param {PIXI.interaction.InteractionEvent} event
     * @returns {boolean}
     */
    move()
    {
        this.update();
        return false
    }

    update()
    {
        if (this.paused)
        {
            return
        }
        const original = { x: this.parent.x, y: this.parent.y };
        const decelerate = this.parent.plugins['decelerate'] || {};
        if (this.options.left !== null || this.options.right !== null)
        {
            let moved = false;
            if (this.parent.screenWorldWidth < this.parent.screenWidth)
            {
                if (!this.noUnderflow)
                {
                    switch (this.underflowX)
                    {
                        case -1:
                            if (this.parent.x !== 0)
                            {
                                this.parent.x = 0;
                                moved = true;
                            }
                            break
                        case 1:
                            if (this.parent.x !== this.parent.screenWidth - this.parent.screenWorldWidth)
                            {
                                this.parent.x = this.parent.screenWidth - this.parent.screenWorldWidth;
                                moved = true;
                            }
                            break
                        default:
                            if (this.parent.x !== (this.parent.screenWidth - this.parent.screenWorldWidth) / 2)
                            {
                                this.parent.x = (this.parent.screenWidth - this.parent.screenWorldWidth) / 2;
                                moved = true;
                            }
                    }
                }
            }
            else
            {
                if (this.options.left !== null)
                {
                    if (this.parent.left < (this.options.left === true ? 0 : this.options.left))
                    {
                        this.parent.x = -(this.options.left === true ? 0 : this.options.left) * this.parent.scale.x;
                        decelerate.x = 0;
                        moved = true;
                    }
                }
                if (this.options.right !== null)
                {
                    if (this.parent.right > (this.options.right === true ? this.parent.worldWidth : this.options.right))
                    {
                        this.parent.x = -(this.options.right === true ? this.parent.worldWidth : this.options.right) * this.parent.scale.x + this.parent.screenWidth;
                        decelerate.x = 0;
                        moved = true;
                    }
                }
            }
            if (moved)
            {
                this.parent.emit('moved', { viewport: this.parent, original, type: 'clamp-x' });
            }
        }
        if (this.options.top !== null || this.options.bottom !== null)
        {
            let moved = false;
            if (this.parent.screenWorldHeight < this.parent.screenHeight)
            {
                if (!this.noUnderflow)
                {
                    switch (this.underflowY)
                    {
                        case -1:
                            if (this.parent.y !== 0)
                            {
                                this.parent.y = 0;
                                moved = true;
                            }
                            break
                        case 1:
                            if (this.parent.y !== this.parent.screenHeight - this.parent.screenWorldHeight)
                            {
                                this.parent.y = (this.parent.screenHeight - this.parent.screenWorldHeight);
                                moved = true;
                            }
                            break
                        default:
                            if (this.parent.y !== (this.parent.screenHeight - this.parent.screenWorldHeight) / 2)
                            {
                                this.parent.y = (this.parent.screenHeight - this.parent.screenWorldHeight) / 2;
                                moved = true;
                            }
                    }
                }
            }
            else
            {
                if (this.options.top !== null)
                {
                    if (this.parent.top < (this.options.top === true ? 0 : this.options.top))
                    {
                        this.parent.y = -(this.options.top === true ? 0 : this.options.top) * this.parent.scale.y;
                        decelerate.y = 0;
                        moved = true;
                    }
                }
                if (this.options.bottom !== null)
                {
                    if (this.parent.bottom > (this.options.bottom === true ? this.parent.worldHeight : this.options.bottom))
                    {
                        this.parent.y = -(this.options.bottom === true ? this.parent.worldHeight : this.options.bottom) * this.parent.scale.y + this.parent.screenHeight;
                        decelerate.y = 0;
                        moved = true;
                    }
                }
            }
            if (moved)
            {
                this.parent.emit('moved', { viewport: this.parent, original, type: 'clamp-y' });
            }
        }
    }
}

/**
 * @typedef {object} ClampZoomOptions
 * @property {number} [minWidth] minimum width
 * @property {number} [minHeight] minimum height
 * @property {number} [maxWidth] maximum width
 * @property {number} [maxHeight] maximum height
 */

const clampZoomOptions = {
    minWidth: null,
    minHeight: null,
    maxWidth: null,
    maxHeight: null
};

class ClampZoom extends Plugin
{
    /**
     * @private
     * @param {Viewport} parent
     * @param {ClampZoomOptions} [options]
     */
    constructor(parent, options={})
    {
        super(parent);
        this.options = Object.assign({}, clampZoomOptions, options);
        this.clamp();
    }

    resize()
    {
        this.clamp();
    }

    clamp()
    {
        if (this.paused)
        {
            return
        }

        let width = this.parent.worldScreenWidth;
        let height = this.parent.worldScreenHeight;
        if (this.options.minWidth !== null && width < this.options.minWidth)
        {
            const original = this.parent.scale.x;
            this.parent.fitWidth(this.options.minWidth, false, false, true);
            this.parent.scale.y *= this.parent.scale.x / original;
            width = this.parent.worldScreenWidth;
            height = this.parent.worldScreenHeight;
            this.parent.emit('zoomed', { viewport: this.parent, type: 'clamp-zoom' });
        }
        if (this.options.maxWidth !== null && width > this.options.maxWidth)
        {
            const original = this.parent.scale.x;
            this.parent.fitWidth(this.options.maxWidth, false, false, true);
            this.parent.scale.y *= this.parent.scale.x / original;
            width = this.parent.worldScreenWidth;
            height = this.parent.worldScreenHeight;
            this.parent.emit('zoomed', { viewport: this.parent, type: 'clamp-zoom' });
        }
        if (this.options.minHeight !== null && height < this.options.minHeight)
        {
            const original = this.parent.scale.y;
            this.parent.fitHeight(this.options.minHeight, false, false, true);
            this.parent.scale.x *= this.parent.scale.y / original;
            width = this.parent.worldScreenWidth;
            height = this.parent.worldScreenHeight;
            this.parent.emit('zoomed', { viewport: this.parent, type: 'clamp-zoom' });
        }
        if (this.options.maxHeight !== null && height > this.options.maxHeight)
        {
            const original = this.parent.scale.y;
            this.parent.fitHeight(this.options.maxHeight, false, false, true);
            this.parent.scale.x *= this.parent.scale.y / original;
            this.parent.emit('zoomed', { viewport: this.parent, type: 'clamp-zoom' });
        }
    }
}

/**
 * @typedef {object} DecelerateOptions
 * @property {number} [friction=0.95] percent to decelerate after movement
 * @property {number} [bounce=0.8] percent to decelerate when past boundaries (only applicable when viewport.bounce() is active)
 * @property {number} [minSpeed=0.01] minimum velocity before stopping/reversing acceleration
 */

const decelerateOptions = {
    friction: 0.95,
    bounce: 0.8,
    minSpeed: 0.01
};

class Decelerate extends Plugin
{
    /**
     * @private
     * @param {Viewport} parent
     * @param {DecelerateOptions} [options]
     */
    constructor(parent, options={})
    {
        super(parent);
        this.options = Object.assign({}, decelerateOptions, options);
        this.saved = [];
        this.reset();
        this.parent.on('moved', data => this.moved(data));
    }

    destroy()
    {
        this.parent;
    }

    down()
    {
        this.saved = [];
        this.x = this.y = false;
    }

    isActive()
    {
        return this.x || this.y
    }

    move()
    {
        if (this.paused)
        {
            return
        }

        const count = this.parent.input.count();
        if (count === 1 || (count > 1 && !this.parent.plugins.get('pinch')))
        {
            this.saved.push({ x: this.parent.x, y: this.parent.y, time: performance.now() });
            if (this.saved.length > 60)
            {
                this.saved.splice(0, 30);
            }
        }
    }

    moved(data)
    {
        if (this.saved.length)
        {
            const last = this.saved[this.saved.length - 1];
            if (data.type === 'clamp-x')
            {
                if (last.x === data.original.x)
                {
                    last.x = this.parent.x;
                }
            }
            else if (data.type === 'clamp-y')
            {
                if (last.y === data.original.y)
                {
                    last.y = this.parent.y;
                }
            }
        }
    }

    up()
    {
        if (this.parent.input.count() === 0 && this.saved.length)
        {
            const now = performance.now();
            for (let save of this.saved)
            {
                if (save.time >= now - 100)
                {
                    const time = now - save.time;
                    this.x = (this.parent.x - save.x) / time;
                    this.y = (this.parent.y - save.y) / time;
                    this.percentChangeX = this.percentChangeY = this.options.friction;
                    break
                }
            }
        }
    }

    /**
     * manually activate plugin
     * @param {object} options
     * @param {number} [options.x]
     * @param {number} [options.y]
     */
    activate(options)
    {
        options = options || {};
        if (typeof options.x !== 'undefined')
        {
            this.x = options.x;
            this.percentChangeX = this.options.friction;
        }
        if (typeof options.y !== 'undefined')
        {
            this.y = options.y;
            this.percentChangeY = this.options.friction;
        }
    }

    update(elapsed)
    {
        if (this.paused)
        {
            return
        }

        let moved;
        if (this.x)
        {
            this.parent.x += this.x * elapsed;
            this.x *= this.percentChangeX;
            if (Math.abs(this.x) < this.options.minSpeed)
            {
                this.x = 0;
            }
            moved = true;
        }
        if (this.y)
        {
            this.parent.y += this.y * elapsed;
            this.y *= this.percentChangeY;
            if (Math.abs(this.y) < this.options.minSpeed)
            {
                this.y = 0;
            }
            moved = true;
        }
        if (moved)
        {
            this.parent.emit('moved', { viewport: this.parent, type: 'decelerate' });
        }
    }

    reset()
    {
        this.x = this.y = null;
    }
}

var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

function createCommonjsModule(fn, module) {
	return module = { exports: {} }, fn(module, module.exports), module.exports;
}

var penner = createCommonjsModule(function (module, exports) {
/*
	Copyright © 2001 Robert Penner
	All rights reserved.

	Redistribution and use in source and binary forms, with or without modification, 
	are permitted provided that the following conditions are met:

	Redistributions of source code must retain the above copyright notice, this list of 
	conditions and the following disclaimer.
	Redistributions in binary form must reproduce the above copyright notice, this list 
	of conditions and the following disclaimer in the documentation and/or other materials 
	provided with the distribution.

	Neither the name of the author nor the names of contributors may be used to endorse 
	or promote products derived from this software without specific prior written permission.

	THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY 
	EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
	MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
	COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
	EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE
	GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED 
	AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
	NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED 
	OF THE POSSIBILITY OF SUCH DAMAGE.
 */

(function() {
  var penner, umd;

  umd = function(factory) {
    {
      return module.exports = factory;
    }
  };

  penner = {
    linear: function(t, b, c, d) {
      return c * t / d + b;
    },
    easeInQuad: function(t, b, c, d) {
      return c * (t /= d) * t + b;
    },
    easeOutQuad: function(t, b, c, d) {
      return -c * (t /= d) * (t - 2) + b;
    },
    easeInOutQuad: function(t, b, c, d) {
      if ((t /= d / 2) < 1) {
        return c / 2 * t * t + b;
      } else {
        return -c / 2 * ((--t) * (t - 2) - 1) + b;
      }
    },
    easeInCubic: function(t, b, c, d) {
      return c * (t /= d) * t * t + b;
    },
    easeOutCubic: function(t, b, c, d) {
      return c * ((t = t / d - 1) * t * t + 1) + b;
    },
    easeInOutCubic: function(t, b, c, d) {
      if ((t /= d / 2) < 1) {
        return c / 2 * t * t * t + b;
      } else {
        return c / 2 * ((t -= 2) * t * t + 2) + b;
      }
    },
    easeInQuart: function(t, b, c, d) {
      return c * (t /= d) * t * t * t + b;
    },
    easeOutQuart: function(t, b, c, d) {
      return -c * ((t = t / d - 1) * t * t * t - 1) + b;
    },
    easeInOutQuart: function(t, b, c, d) {
      if ((t /= d / 2) < 1) {
        return c / 2 * t * t * t * t + b;
      } else {
        return -c / 2 * ((t -= 2) * t * t * t - 2) + b;
      }
    },
    easeInQuint: function(t, b, c, d) {
      return c * (t /= d) * t * t * t * t + b;
    },
    easeOutQuint: function(t, b, c, d) {
      return c * ((t = t / d - 1) * t * t * t * t + 1) + b;
    },
    easeInOutQuint: function(t, b, c, d) {
      if ((t /= d / 2) < 1) {
        return c / 2 * t * t * t * t * t + b;
      } else {
        return c / 2 * ((t -= 2) * t * t * t * t + 2) + b;
      }
    },
    easeInSine: function(t, b, c, d) {
      return -c * Math.cos(t / d * (Math.PI / 2)) + c + b;
    },
    easeOutSine: function(t, b, c, d) {
      return c * Math.sin(t / d * (Math.PI / 2)) + b;
    },
    easeInOutSine: function(t, b, c, d) {
      return -c / 2 * (Math.cos(Math.PI * t / d) - 1) + b;
    },
    easeInExpo: function(t, b, c, d) {
      if (t === 0) {
        return b;
      } else {
        return c * Math.pow(2, 10 * (t / d - 1)) + b;
      }
    },
    easeOutExpo: function(t, b, c, d) {
      if (t === d) {
        return b + c;
      } else {
        return c * (-Math.pow(2, -10 * t / d) + 1) + b;
      }
    },
    easeInOutExpo: function(t, b, c, d) {
      if ((t /= d / 2) < 1) {
        return c / 2 * Math.pow(2, 10 * (t - 1)) + b;
      } else {
        return c / 2 * (-Math.pow(2, -10 * --t) + 2) + b;
      }
    },
    easeInCirc: function(t, b, c, d) {
      return -c * (Math.sqrt(1 - (t /= d) * t) - 1) + b;
    },
    easeOutCirc: function(t, b, c, d) {
      return c * Math.sqrt(1 - (t = t / d - 1) * t) + b;
    },
    easeInOutCirc: function(t, b, c, d) {
      if ((t /= d / 2) < 1) {
        return -c / 2 * (Math.sqrt(1 - t * t) - 1) + b;
      } else {
        return c / 2 * (Math.sqrt(1 - (t -= 2) * t) + 1) + b;
      }
    },
    easeInElastic: function(t, b, c, d) {
      var a, p, s;
      s = 1.70158;
      p = 0;
      a = c;
      if (t === 0) ; else if ((t /= d) === 1) ;
      if (!p) {
        p = d * .3;
      }
      if (a < Math.abs(c)) {
        a = c;
        s = p / 4;
      } else {
        s = p / (2 * Math.PI) * Math.asin(c / a);
      }
      return -(a * Math.pow(2, 10 * (t -= 1)) * Math.sin((t * d - s) * (2 * Math.PI) / p)) + b;
    },
    easeOutElastic: function(t, b, c, d) {
      var a, p, s;
      s = 1.70158;
      p = 0;
      a = c;
      if (t === 0) ; else if ((t /= d) === 1) ;
      if (!p) {
        p = d * .3;
      }
      if (a < Math.abs(c)) {
        a = c;
        s = p / 4;
      } else {
        s = p / (2 * Math.PI) * Math.asin(c / a);
      }
      return a * Math.pow(2, -10 * t) * Math.sin((t * d - s) * (2 * Math.PI) / p) + c + b;
    },
    easeInOutElastic: function(t, b, c, d) {
      var a, p, s;
      s = 1.70158;
      p = 0;
      a = c;
      if (t === 0) ; else if ((t /= d / 2) === 2) ;
      if (!p) {
        p = d * (.3 * 1.5);
      }
      if (a < Math.abs(c)) {
        a = c;
        s = p / 4;
      } else {
        s = p / (2 * Math.PI) * Math.asin(c / a);
      }
      if (t < 1) {
        return -.5 * (a * Math.pow(2, 10 * (t -= 1)) * Math.sin((t * d - s) * (2 * Math.PI) / p)) + b;
      } else {
        return a * Math.pow(2, -10 * (t -= 1)) * Math.sin((t * d - s) * (2 * Math.PI) / p) * .5 + c + b;
      }
    },
    easeInBack: function(t, b, c, d, s) {
      if (s === void 0) {
        s = 1.70158;
      }
      return c * (t /= d) * t * ((s + 1) * t - s) + b;
    },
    easeOutBack: function(t, b, c, d, s) {
      if (s === void 0) {
        s = 1.70158;
      }
      return c * ((t = t / d - 1) * t * ((s + 1) * t + s) + 1) + b;
    },
    easeInOutBack: function(t, b, c, d, s) {
      if (s === void 0) {
        s = 1.70158;
      }
      if ((t /= d / 2) < 1) {
        return c / 2 * (t * t * (((s *= 1.525) + 1) * t - s)) + b;
      } else {
        return c / 2 * ((t -= 2) * t * (((s *= 1.525) + 1) * t + s) + 2) + b;
      }
    },
    easeInBounce: function(t, b, c, d) {
      var v;
      v = penner.easeOutBounce(d - t, 0, c, d);
      return c - v + b;
    },
    easeOutBounce: function(t, b, c, d) {
      if ((t /= d) < 1 / 2.75) {
        return c * (7.5625 * t * t) + b;
      } else if (t < 2 / 2.75) {
        return c * (7.5625 * (t -= 1.5 / 2.75) * t + .75) + b;
      } else if (t < 2.5 / 2.75) {
        return c * (7.5625 * (t -= 2.25 / 2.75) * t + .9375) + b;
      } else {
        return c * (7.5625 * (t -= 2.625 / 2.75) * t + .984375) + b;
      }
    },
    easeInOutBounce: function(t, b, c, d) {
      var v;
      if (t < d / 2) {
        v = penner.easeInBounce(t * 2, 0, c, d);
        return v * .5 + b;
      } else {
        v = penner.easeOutBounce(t * 2 - d, 0, c, d);
        return v * .5 + c * .5 + b;
      }
    }
  };

  umd(penner);

}).call(commonjsGlobal);
});

/**
 * returns correct Penner equation using string or Function
 * @param {(function|string)} [ease]
 * @param {defaults} default penner equation to use if none is provided
 */
function ease(ease, defaults)
{
    if (!ease)
    {
        return penner[defaults]
    }
    else if (typeof ease === 'function')
    {
        return ease
    }
    else if (typeof ease === 'string')
    {
        return penner[ease]
    }
}

/**
 * @typedef {options} BounceOptions
 * @property {string} [sides=all] all, horizontal, vertical, or combination of top, bottom, right, left (e.g., 'top-bottom-right')
 * @property {number} [friction=0.5] friction to apply to decelerate if active
 * @property {number} [time=150] time in ms to finish bounce
 * @property {string|function} [ease=easeInOutSine] ease function or name (see http://easings.net/ for supported names)
 * @property {string} [underflow=center] (top/bottom/center and left/right/center, or center) where to place world if too small for screen
 */

const bounceOptions = {
    sides: 'all',
    friction: 0.5,
    time: 150,
    ease: 'easeInOutSine',
    underflow: 'center'
};

class Bounce extends Plugin
{
    /**
     * @private
     * @param {Viewport} parent
     * @param {BounceOptions} [options]
     * @fires bounce-start-x
     * @fires bounce.end-x
     * @fires bounce-start-y
     * @fires bounce-end-y
     */
    constructor(parent, options={})
    {
        super(parent);
        this.options = Object.assign({}, bounceOptions, options);
        this.ease = ease(this.options.ease, 'easeInOutSine');
        if (this.options.sides)
        {
            if (this.options.sides === 'all')
            {
                this.top = this.bottom = this.left = this.right = true;
            }
            else if (this.options.sides === 'horizontal')
            {
                this.right = this.left = true;
            }
            else if (this.options.sides === 'vertical')
            {
                this.top = this.bottom = true;
            }
            else
            {
                this.top = this.options.sides.indexOf('top') !== -1;
                this.bottom = this.options.sides.indexOf('bottom') !== -1;
                this.left = this.options.sides.indexOf('left') !== -1;
                this.right = this.options.sides.indexOf('right') !== -1;
            }
        }
        this.parseUnderflow();
        this.last = {};
        this.reset();
    }

    parseUnderflow()
    {
        const clamp = this.options.underflow.toLowerCase();
        if (clamp === 'center')
        {
            this.underflowX = 0;
            this.underflowY = 0;
        }
        else
        {
            this.underflowX = (clamp.indexOf('left') !== -1) ? -1 : (clamp.indexOf('right') !== -1) ? 1 : 0;
            this.underflowY = (clamp.indexOf('top') !== -1) ? -1 : (clamp.indexOf('bottom') !== -1) ? 1 : 0;
        }
    }

    isActive()
    {
        return this.toX !== null || this.toY !== null
    }

    down()
    {
        this.toX = this.toY = null;
    }

    up()
    {
        this.bounce();
    }

    update(elapsed)
    {
        if (this.paused)
        {
            return
        }

        this.bounce();
        if (this.toX)
        {
            const toX = this.toX;
            toX.time += elapsed;
            this.parent.emit('moved', { viewport: this.parent, type: 'bounce-x' });
            if (toX.time >= this.options.time)
            {
                this.parent.x = toX.end;
                this.toX = null;
                this.parent.emit('bounce-x-end', this.parent);
            }
            else
            {
                this.parent.x = this.ease(toX.time, toX.start, toX.delta, this.options.time);
            }
        }
        if (this.toY)
        {
            const toY = this.toY;
            toY.time += elapsed;
            this.parent.emit('moved', { viewport: this.parent, type: 'bounce-y' });
            if (toY.time >= this.options.time)
            {
                this.parent.y = toY.end;
                this.toY = null;
                this.parent.emit('bounce-y-end', this.parent);
            }
            else
            {
                this.parent.y = this.ease(toY.time, toY.start, toY.delta, this.options.time);
            }
        }
    }

    calcUnderflowX()
    {
        let x;
        switch (this.underflowX)
        {
            case -1:
                x = 0;
                break
            case 1:
                x = (this.parent.screenWidth - this.parent.screenWorldWidth);
                break
            default:
                x = (this.parent.screenWidth - this.parent.screenWorldWidth) / 2;
        }
        return x
    }

    calcUnderflowY()
    {
        let y;
        switch (this.underflowY)
        {
            case -1:
                y = 0;
                break
            case 1:
                y = (this.parent.screenHeight - this.parent.screenWorldHeight);
                break
            default:
                y = (this.parent.screenHeight - this.parent.screenWorldHeight) / 2;
        }
        return y
    }

    bounce()
    {
        if (this.paused)
        {
            return
        }

        let oob;
        let decelerate = this.parent.plugins.get('decelerate');
        if (decelerate && (decelerate.x || decelerate.y))
        {
            if ((decelerate.x && decelerate.percentChangeX === decelerate.options.friction) || (decelerate.y && decelerate.percentChangeY === decelerate.options.friction))
            {
                oob = this.parent.OOB();
                if ((oob.left && this.left) || (oob.right && this.right))
                {
                    decelerate.percentChangeX = this.options.friction;
                }
                if ((oob.top && this.top) || (oob.bottom && this.bottom))
                {
                    decelerate.percentChangeY = this.options.friction;
                }
            }
        }
        const drag = this.parent.plugins.get('drag') || {};
        const pinch = this.parent.plugins.get('pinch') || {};
        decelerate = decelerate || {};
        if (!drag.active && !pinch.active && ((!this.toX || !this.toY) && (!decelerate.x || !decelerate.y)))
        {
            oob = oob || this.parent.OOB();
            const point = oob.cornerPoint;
            if (!this.toX && !decelerate.x)
            {
                let x = null;
                if (oob.left && this.left)
                {
                    x = (this.parent.screenWorldWidth < this.parent.screenWidth) ? this.calcUnderflowX() : 0;
                }
                else if (oob.right && this.right)
                {
                    x = (this.parent.screenWorldWidth < this.parent.screenWidth) ? this.calcUnderflowX() : -point.x;
                }
                if (x !== null && this.parent.x !== x)
                {
                    this.toX = { time: 0, start: this.parent.x, delta: x - this.parent.x, end: x };
                    this.parent.emit('bounce-x-start', this.parent);
                }
            }
            if (!this.toY && !decelerate.y)
            {
                let y = null;
                if (oob.top && this.top)
                {
                    y = (this.parent.screenWorldHeight < this.parent.screenHeight) ? this.calcUnderflowY() : 0;
                }
                else if (oob.bottom && this.bottom)
                {
                    y = (this.parent.screenWorldHeight < this.parent.screenHeight) ? this.calcUnderflowY() : -point.y;
                }
                if (y !== null && this.parent.y !== y)
                {
                    this.toY = { time: 0, start: this.parent.y, delta: y - this.parent.y, end: y };
                    this.parent.emit('bounce-y-start', this.parent);
                }
            }
        }
    }

    reset()
    {
        this.toX = this.toY = null;
    }
}

/**
 * @typedef SnapOptions
 * @property {boolean} [topLeft] snap to the top-left of viewport instead of center
 * @property {number} [friction=0.8] friction/frame to apply if decelerate is active
 * @property {number} [time=1000]
 * @property {string|function} [ease=easeInOutSine] ease function or name (see http://easings.net/ for supported names)
 * @property {boolean} [interrupt=true] pause snapping with any user input on the viewport
 * @property {boolean} [removeOnComplete] removes this plugin after snapping is complete
 * @property {boolean} [removeOnInterrupt] removes this plugin if interrupted by any user input
 * @property {boolean} [forceStart] starts the snap immediately regardless of whether the viewport is at the desired location
 */

const snapOptions = {
    topLeft: false,
    friction: 0.8,
    time: 1000,
    ease: 'easeInOutSine',
    interrupt: true,
    removeOnComplete: false,
    removeOnInterrupt: false,
    forceStart: false
};

class Snap extends Plugin
{
    /**
     * @private
     * @param {Viewport} parent
     * @param {number} x
     * @param {number} y
     * @param {SnapOptions} [options]
     * @event snap-start(Viewport) emitted each time a snap animation starts
     * @event snap-restart(Viewport) emitted each time a snap resets because of a change in viewport size
     * @event snap-end(Viewport) emitted each time snap reaches its target
     * @event snap-remove(Viewport) emitted if snap plugin is removed
     */
    constructor(parent, x, y, options={})
    {
        super(parent);
        this.options = Object.assign({}, snapOptions, options);
        this.ease = ease(options.ease, 'easeInOutSine');
        this.x = x;
        this.y = y;
        if (this.options.forceStart)
        {
            this.snapStart();
        }
    }

    snapStart()
    {
        this.percent = 0;
        this.snapping = { time: 0 };
        const current = this.options.topLeft ? this.parent.corner : this.parent.center;
        this.deltaX = this.x - current.x;
        this.deltaY = this.y - current.y;
        this.startX = current.x;
        this.startY = current.y;
        this.parent.emit('snap-start', this.parent);
    }

    wheel()
    {
        if (this.options.removeOnInterrupt)
        {
            this.parent.plugins.remove('snap');
        }
    }

    down()
    {
        if (this.options.removeOnInterrupt)
        {
            this.parent.plugins.remove('snap');
        }
        else if (this.options.interrupt)
        {
            this.snapping = null;
        }
    }

    up()
    {
        if (this.parent.input.count() === 0)
        {
            const decelerate = this.parent.plugins.get('decelerate');
            if (decelerate && (decelerate.x || decelerate.y))
            {
                decelerate.percentChangeX = decelerate.percentChangeY = this.options.friction;
            }
        }
    }

    update(elapsed)
    {
        if (this.paused)
        {
            return
        }
        if (this.options.interrupt && this.parent.input.count() !== 0)
        {
            return
        }
        if (!this.snapping)
        {
            const current = this.options.topLeft ? this.parent.corner : this.parent.center;
            if (current.x !== this.x || current.y !== this.y)
            {
                this.snapStart();
            }
        }
        else
        {
            const snapping = this.snapping;
            snapping.time += elapsed;
            let finished, x, y;
            if (snapping.time > this.options.time)
            {
                finished = true;
                x = this.startX + this.deltaX;
                y = this.startY + this.deltaY;
            }
            else
            {
                const percent = this.ease(snapping.time, 0, 1, this.options.time);
                x = this.startX + this.deltaX * percent;
                y = this.startY + this.deltaY * percent;
            }
            if (this.options.topLeft)
            {
                this.parent.moveCorner(x, y);
            }
            else
            {
                this.parent.moveCenter(x, y);
            }
            this.parent.emit('moved', { viewport: this.parent, type: 'snap' });
            if (finished)
            {
                if (this.options.removeOnComplete)
                {
                    this.parent.plugins.remove('snap');
                }
                this.parent.emit('snap-end', this.parent);
                this.snapping = null;
            }
        }
    }
}

/**
 * @typedef {Object} SnapZoomOptions
 * @property {number} [width=0] the desired width to snap (to maintain aspect ratio, choose only width or height)
 * @property {number} [height=0] the desired height to snap (to maintain aspect ratio, choose only width or height)
 * @property {number} [time=1000] time for snapping in ms
 * @property {(string|function)} [ease=easeInOutSine] ease function or name (see http://easings.net/ for supported names)
 * @property {PIXI.Point} [center] place this point at center during zoom instead of center of the viewport
 * @property {boolean} [interrupt=true] pause snapping with any user input on the viewport
 * @property {boolean} [removeOnComplete] removes this plugin after snapping is complete
 * @property {boolean} [removeOnInterrupt] removes this plugin if interrupted by any user input
 * @property {boolean} [forceStart] starts the snap immediately regardless of whether the viewport is at the desired zoom
 * @property {boolean} [noMove] zoom but do not move
 */

const snapZoomOptions = {
    width: 0,
    height: 0,
    time: 1000,
    ease: 'easeInOutSine',
    center: null,
    interrupt: true,
    removeOnComplete: false,
    removeOnInterrupts: false,
    forceStart: false,
    noMove: false
};
class SnapZoom extends Plugin
{
    /**
     * @param {Viewport} parent
     * @param {SnapZoomOptions} options
     * @event snap-zoom-start(Viewport) emitted each time a fit animation starts
     * @event snap-zoom-end(Viewport) emitted each time fit reaches its target
     * @event snap-zoom-end(Viewport) emitted each time fit reaches its target
     */
    constructor(parent, options={})
    {
        super(parent);
        this.options = Object.assign({}, snapZoomOptions, options);
        this.ease = ease(this.options.ease);
        if (this.options.width > 0)
        {
            this.x_scale = parent.screenWidth / this.options.width;
        }
        if (this.options.height > 0)
        {
            this.y_scale = parent.screenHeight / this.options.height;
        }
        this.xIndependent = this.x_scale ? true : false;
        this.yIndependent = this.y_scale ? true : false;
        this.x_scale = this.xIndependent ? this.x_scale : this.y_scale;
        this.y_scale = this.yIndependent ? this.y_scale : this.x_scale;

        if (this.options.time === 0)
        {
            parent.container.scale.x = this.x_scale;
            parent.container.scale.y = this.y_scale;
            if (this.options.removeOnComplete)
            {
                this.parent.plugins.remove('snap-zoom');
            }
        }
        else if (options.forceStart)
        {
            this.createSnapping();
        }
    }

    createSnapping()
    {
        const scale = this.parent.scale;
        this.snapping = { time: 0, startX: scale.x, startY: scale.y, deltaX: this.x_scale - scale.x, deltaY: this.y_scale - scale.y };
        this.parent.emit('snap-zoom-start', this.parent);
    }

    resize()
    {
        this.snapping = null;

        if (this.options.width > 0)
        {
            this.x_scale = this.parent._screenWidth / this.options.width;
        }
        if (this.options.height > 0)
        {
            this.y_scale = this.parent._screenHeight / this.options.height;
        }
        this.x_scale = this.xIndependent ? this.x_scale : this.y_scale;
        this.y_scale = this.yIndependent ? this.y_scale : this.x_scale;
    }

    reset()
    {
        this.snapping = null;
    }

    wheel()
    {
        if (this.options.removeOnInterrupt)
        {
            this.parent.plugins.remove('snap-zoom');
        }
    }

    down()
    {
        if (this.options.removeOnInterrupt)
        {
            this.parent.plugins.remove('snap-zoom');
        }
        else if (this.options.interrupt)
        {
            this.snapping = null;
        }
    }

    update(elapsed)
    {
        if (this.paused)
        {
            return
        }
        if (this.options.interrupt && this.parent.input.count() !== 0)
        {
            return
        }

        let oldCenter;
        if (!this.options.center && !this.options.noMove)
        {
            oldCenter = this.parent.center;
        }
        if (!this.snapping)
        {
            if (this.parent.scale.x !== this.x_scale || this.parent.scale.y !== this.y_scale)
            {
                this.createSnapping();
            }
        }
        else if (this.snapping)
        {
            const snapping = this.snapping;
            snapping.time += elapsed;
            if (snapping.time >= this.options.time)
            {
                this.parent.scale.set(this.x_scale, this.y_scale);
                if (this.options.removeOnComplete)
                {
                    this.parent.plugins.remove('snap-zoom');
                }
                this.parent.emit('snap-zoom-end', this.parent);
                this.snapping = null;
            }
            else
            {
                const snapping = this.snapping;
                this.parent.scale.x = this.ease(snapping.time, snapping.startX, snapping.deltaX, this.options.time);
                this.parent.scale.y = this.ease(snapping.time, snapping.startY, snapping.deltaY, this.options.time);
            }
            const clamp = this.parent.plugins.get('clamp-zoom');
            if (clamp)
            {
                clamp.clamp();
            }
            if (!this.options.noMove)
            {
                if (!this.options.center)
                {
                    this.parent.moveCenter(oldCenter);
                }
                else
                {
                    this.parent.moveCenter(this.options.center);
                }
            }
        }
    }

    resume()
    {
        this.snapping = null;
        super.resume();
    }
}

/**
 * @typedef {object} FollowOptions
 * @property {number} [speed=0] to follow in pixels/frame (0=teleport to location)
 * @property {number} [acceleration] set acceleration to accelerate and decelerate at this rate; speed cannot be 0 to use acceleration
 * @property {number} [radius] radius (in world coordinates) of center circle where movement is allowed without moving the viewport
 */

const followOptions = {
    speed: 0,
    acceleration: null,
    radius: null
};

class Follow extends Plugin
{
    /**
     * @private
     * @param {Viewport} parent
     * @param {PIXI.DisplayObject} target to follow
     * @param {FollowOptions} [options]
     */
    constructor(parent, target, options = {})
    {
        super(parent);
        this.target = target;
        this.options = Object.assign({}, followOptions, options);
        this.velocity = { x: 0, y: 0 };
    }

    update(elapsed)
    {
        if (this.paused)
        {
            return
        }

        const center = this.parent.center;
        let toX = this.target.x,
            toY = this.target.y;
        if (this.options.radius)
        {
            const distance = Math.sqrt(Math.pow(this.target.y - center.y, 2) + Math.pow(this.target.x - center.x, 2));
            if (distance > this.options.radius)
            {
                const angle = Math.atan2(this.target.y - center.y, this.target.x - center.x);
                toX = this.target.x - Math.cos(angle) * this.options.radius;
                toY = this.target.y - Math.sin(angle) * this.options.radius;
            }
            else
            {
                return
            }
        }

        const deltaX = toX - center.x;
        const deltaY = toY - center.y;
        if (deltaX || deltaY)
        {
            if (this.options.speed)
            {
                if (this.options.acceleration)
                {
                    const angle = Math.atan2(toY - center.y, toX - center.x);
                    const distance = Math.sqrt(Math.pow(deltaX, 2) + Math.pow(deltaY, 2));
                    if (distance)
                    {
                        const decelerationDistance = (Math.pow(this.velocity.x, 2) + Math.pow(this.velocity.y, 2)) / (2 * this.options.acceleration);
                        if (distance > decelerationDistance)
                        {
                            this.velocity = {
                                x: Math.min(this.velocity.x + this.options.acceleration * elapsed, this.options.speed),
                                y: Math.min(this.velocity.y + this.options.acceleration * elapsed, this.options.speed)
                            };
                        }
                        else
                        {
                            this.velocity = {
                                x: Math.max(this.velocity.x - this.options.acceleration * this.options.speed, 0),
                                y: Math.max(this.velocity.y - this.options.acceleration * this.options.speed, 0)
                            };
                        }
                        const changeX = Math.cos(angle) * this.velocity.x;
                        const changeY = Math.sin(angle) * this.velocity.y;
                        const x = Math.abs(changeX) > Math.abs(deltaX) ? toX : center.x + changeX;
                        const y = Math.abs(changeY) > Math.abs(deltaY) ? toY : center.y + changeY;
                        this.parent.moveCenter(x, y);
                        this.parent.emit('moved', { viewport: this.parent, type: 'follow' });
                    }
                }
                else
                {
                    const angle = Math.atan2(toY - center.y, toX - center.x);
                    const changeX = Math.cos(angle) * this.options.speed;
                    const changeY = Math.sin(angle) * this.options.speed;
                    const x = Math.abs(changeX) > Math.abs(deltaX) ? toX : center.x + changeX;
                    const y = Math.abs(changeY) > Math.abs(deltaY) ? toY : center.y + changeY;
                    this.parent.moveCenter(x, y);
                    this.parent.emit('moved', { viewport: this.parent, type: 'follow' });
                }
            }
            else
            {
                this.parent.moveCenter(toX, toY);
                this.parent.emit('moved', { viewport: this.parent, type: 'follow' });
            }
        }
    }
}

/**
 * @typedef WheelOptions
 * @property {number} [percent=0.1] percent to scroll with each spin
 * @property {number} [smooth] smooth the zooming by providing the number of frames to zoom between wheel spins
 * @property {boolean} [interrupt=true] stop smoothing with any user input on the viewport
 * @property {boolean} [reverse] reverse the direction of the scroll
 * @property {PIXI.Point} [center] place this point at center during zoom instead of current mouse position
 */

const wheelOptions = {
    percent: 0.1,
    smooth: false,
    interrupt: true,
    reverse: false,
    center: null
};

class Wheel extends Plugin
{
    /**
     * @private
     * @param {Viewport} parent
     * @param {WheelOptions} [options]
     * @event wheel({wheel: {dx, dy, dz}, event, viewport})
     */
    constructor(parent, options = {})
    {
        super(parent);
        this.options = Object.assign({}, wheelOptions, options);
    }

    down()
    {
        if (this.options.interrupt)
        {
            this.smoothing = null;
        }
    }

    update()
    {
        if (this.smoothing)
        {
            const point = this.smoothingCenter;
            const change = this.smoothing;
            let oldPoint;
            if (!this.options.center)
            {
                oldPoint = this.parent.toLocal(point);
            }
            this.parent.scale.x += change.x;
            this.parent.scale.y += change.y;
            this.parent.emit('zoomed', { viewport: this.parent, type: 'wheel' });
            const clamp = this.parent.plugins.get('clamp-zoom');
            if (clamp)
            {
                clamp.clamp();
            }
            if (this.options.center)
            {
                this.parent.moveCenter(this.options.center);
            }
            else
            {
                const newPoint = this.parent.toGlobal(oldPoint);
                this.parent.x += point.x - newPoint.x;
                this.parent.y += point.y - newPoint.y;
            }
            this.smoothingCount++;
            if (this.smoothingCount >= this.options.smooth)
            {
                this.smoothing = null;
            }
        }
    }

    wheel(e)
    {
        if (this.paused)
        {
            return
        }

        let point = this.parent.input.getPointerPosition(e);
        const sign = this.options.reverse ? -1 : 1;
        const step = sign * -e.deltaY * (e.deltaMode ? 120 : 1) / 500;
        const change = Math.pow(2, (1 + this.options.percent) * step);
        if (this.options.smooth)
        {
            const original = {
                x: this.smoothing ? this.smoothing.x * (this.options.smooth - this.smoothingCount) : 0,
                y: this.smoothing ? this.smoothing.y * (this.options.smooth - this.smoothingCount) : 0
            };
            this.smoothing = {
                x: ((this.parent.scale.x + original.x) * change - this.parent.scale.x) / this.options.smooth,
                y: ((this.parent.scale.y + original.y) * change - this.parent.scale.y) / this.options.smooth
            };
            this.smoothingCount = 0;
            this.smoothingCenter = point;
        }
        else
        {
            let oldPoint;
            if (!this.options.center)
            {
                oldPoint = this.parent.toLocal(point);
            }
            this.parent.scale.x *= change;
            this.parent.scale.y *= change;
            this.parent.emit('zoomed', { viewport: this.parent, type: 'wheel' });
            const clamp = this.parent.plugins.get('clamp-zoom');
            if (clamp)
            {
                clamp.clamp();
            }
            if (this.options.center)
            {
                this.parent.moveCenter(this.options.center);
            }
            else
            {
                const newPoint = this.parent.toGlobal(oldPoint);
                this.parent.x += point.x - newPoint.x;
                this.parent.y += point.y - newPoint.y;
            }
        }
        this.parent.emit('moved', { viewport: this.parent, type: 'wheel' });
        this.parent.emit('wheel', { wheel: { dx: e.deltaX, dy: e.deltaY, dz: e.deltaZ }, event: e, viewport: this.parent });
        if (!this.parent.options.passiveWheel)
        {
            return true
        }
    }
}

/**
 * @typedef MouseEdgesOptions
 * @property {number} [radius] distance from center of screen in screen pixels
 * @property {number} [distance] distance from all sides in screen pixels
 * @property {number} [top] alternatively, set top distance (leave unset for no top scroll)
 * @property {number} [bottom] alternatively, set bottom distance (leave unset for no top scroll)
 * @property {number} [left] alternatively, set left distance (leave unset for no top scroll)
 * @property {number} [right] alternatively, set right distance (leave unset for no top scroll)
 * @property {number} [speed=8] speed in pixels/frame to scroll viewport
 * @property {boolean} [reverse] reverse direction of scroll
 * @property {boolean} [noDecelerate] don't use decelerate plugin even if it's installed
 * @property {boolean} [linear] if using radius, use linear movement (+/- 1, +/- 1) instead of angled movement (Math.cos(angle from center), Math.sin(angle from center))
 * @property {boolean} [allowButtons] allows plugin to continue working even when there's a mousedown event
 */

const mouseEdgesOptions = {
    radius: null,
    distance: null,
    top: null,
    bottom: null,
    left: null,
    right: null,
    speed: 8,
    reverse: false,
    noDecelerate: false,
    linear: false,
    allowButtons: false
};

class MouseEdges extends Plugin
{
    /**
     * Scroll viewport when mouse hovers near one of the edges.
     * @private
     * @param {Viewport} parent
     * @param {MouseEdgeOptions} [options]
     * @event mouse-edge-start(Viewport) emitted when mouse-edge starts
     * @event mouse-edge-end(Viewport) emitted when mouse-edge ends
     */
    constructor(parent, options={})
    {
        super(parent);
        this.options = Object.assign({}, mouseEdgesOptions, options);
        this.reverse = this.options.reverse ? 1 : -1;
        this.radiusSquared = Math.pow(this.options.radius, 2);
        this.resize();
    }

    resize()
    {
        const distance = this.options.distance;
        if (distance !== null)
        {
            this.left = distance;
            this.top = distance;
            this.right = this.parent.worldScreenWidth - distance;
            this.bottom = this.parent.worldScreenHeight - distance;
        }
        else if (!this.radius)
        {
            this.left = this.options.left;
            this.top = this.options.top;
            this.right = this.options.right === null ? null : this.parent.worldScreenWidth - this.options.right;
            this.bottom = this.options.bottom === null ? null : this.parent.worldScreenHeight - this.options.bottom;
        }
    }

    down()
    {
        if (!this.options.allowButtons)
        {
            this.horizontal = this.vertical = null;
        }
    }

    move(event)
    {
        if ((event.data.pointerType !== 'mouse' && event.data.identifier !== 1) || (!this.options.allowButtons && event.data.buttons !== 0))
        {
            return
        }
        const x = event.data.global.x;
        const y = event.data.global.y;

        if (this.radiusSquared)
        {
            const center = this.parent.toScreen(this.parent.center);
            const distance = Math.pow(center.x - x, 2) + Math.pow(center.y - y, 2);
            if (distance >= this.radiusSquared)
            {
                const angle = Math.atan2(center.y - y, center.x - x);
                if (this.options.linear)
                {
                    this.horizontal = Math.round(Math.cos(angle)) * this.options.speed * this.reverse * (60 / 1000);
                    this.vertical = Math.round(Math.sin(angle)) * this.options.speed * this.reverse * (60 / 1000);
                }
                else
                {
                    this.horizontal = Math.cos(angle) * this.options.speed * this.reverse * (60 / 1000);
                    this.vertical = Math.sin(angle) * this.options.speed * this.reverse * (60 / 1000);
                }
            }
            else
            {
                if (this.horizontal)
                {
                    this.decelerateHorizontal();
                }
                if (this.vertical)
                {
                    this.decelerateVertical();
                }
                this.horizontal = this.vertical = 0;
            }
        }
        else
        {
            if (this.left !== null && x < this.left)
            {
                this.horizontal = 1 * this.reverse * this.options.speed * (60 / 1000);
            }
            else if (this.right !== null && x > this.right)
            {
                this.horizontal = -1 * this.reverse * this.options.speed * (60 / 1000);
            }
            else
            {
                this.decelerateHorizontal();
                this.horizontal = 0;
            }
            if (this.top !== null && y < this.top)
            {
                this.vertical = 1 * this.reverse * this.options.speed * (60 / 1000);
            }
            else if (this.bottom !== null && y > this.bottom)
            {
                this.vertical = -1 * this.reverse * this.options.speed * (60 / 1000);
            }
            else
            {
                this.decelerateVertical();
                this.vertical = 0;
            }
        }
    }

    decelerateHorizontal()
    {
        const decelerate = this.parent.plugins.get('decelerate');
        if (this.horizontal && decelerate && !this.options.noDecelerate)
        {
            decelerate.activate({ x: (this.horizontal * this.options.speed * this.reverse) / (1000 / 60) });
        }
    }

    decelerateVertical()
    {
        const decelerate = this.parent.plugins.get('decelerate');
        if (this.vertical && decelerate && !this.options.noDecelerate)
        {
            decelerate.activate({ y: (this.vertical * this.options.speed * this.reverse) / (1000 / 60)});
        }
    }

    up()
    {
        if (this.horizontal)
        {
            this.decelerateHorizontal();
        }
        if (this.vertical)
        {
            this.decelerateVertical();
        }
        this.horizontal = this.vertical = null;
    }

    update()
    {
        if (this.paused)
        {
            return
        }

        if (this.horizontal || this.vertical)
        {
            const center = this.parent.center;
            if (this.horizontal)
            {
                center.x += this.horizontal * this.options.speed;
            }
            if (this.vertical)
            {
                center.y += this.vertical * this.options.speed;
            }
            this.parent.moveCenter(center);
            this.parent.emit('moved', { viewport: this.parent, type: 'mouse-edges' });
        }
    }
}

/**
 * @typedef {object} ViewportOptions
 * @property {number} [screenWidth=window.innerWidth]
 * @property {number} [screenHeight=window.innerHeight]
 * @property {number} [worldWidth=this.width]
 * @property {number} [worldHeight=this.height]
 * @property {number} [threshold=5] number of pixels to move to trigger an input event (e.g., drag, pinch) or disable a clicked event
 * @property {boolean} [passiveWheel=true] whether the 'wheel' event is set to passive (note: if false, e.preventDefault() will be called when wheel is used over the viewport)
 * @property {boolean} [stopPropagation=false] whether to stopPropagation of events that impact the viewport (except wheel events, see options.passiveWheel)
 * @property {HitArea} [forceHitArea] change the default hitArea from world size to a new value
 * @property {boolean} [noTicker] set this if you want to manually call update() function on each frame
 * @property {PIXI.Ticker} [ticker=PIXI.Ticker.shared] use this PIXI.ticker for updates
 * @property {PIXI.InteractionManager} [interaction=null] InteractionManager, available from instantiated WebGLRenderer/CanvasRenderer.plugins.interaction - used to calculate pointer postion relative to canvas location on screen
 * @property {HTMLElement} [divWheel=document.body] div to attach the wheel event
 * @property {boolean} [disableOnContextMenu] remove oncontextmenu=() => {} from the divWheel element
 */

const viewportOptions = {
    screenWidth: window.innerWidth,
    screenHeight: window.innerHeight,
    worldWidth: null,
    worldHeight: null,
    threshold: 5,
    passiveWheel: true,
    stopPropagation: false,
    forceHitArea: null,
    noTicker: false,
    interaction: null,
    disableOnContextMenu: false
};

/**
 * Main class to use when creating a Viewport
 */
class Viewport extends Container
{
    /**
     * @param {ViewportOptions} [options]
     * @fires clicked
     * @fires drag-start
     * @fires drag-end
     * @fires drag-remove
     * @fires pinch-start
     * @fires pinch-end
     * @fires pinch-remove
     * @fires snap-start
     * @fires snap-end
     * @fires snap-remove
     * @fires snap-zoom-start
     * @fires snap-zoom-end
     * @fires snap-zoom-remove
     * @fires bounce-x-start
     * @fires bounce-x-end
     * @fires bounce-y-start
     * @fires bounce-y-end
     * @fires bounce-remove
     * @fires wheel
     * @fires wheel-remove
     * @fires wheel-scroll
     * @fires wheel-scroll-remove
     * @fires mouse-edge-start
     * @fires mouse-edge-end
     * @fires mouse-edge-remove
     * @fires moved
     * @fires moved-end
     * @fires zoomed
     * @fires zoomed-end
     * @fires frame-end
     */
    constructor(options = {})
    {
        super();
        this.options = Object.assign({}, viewportOptions, options);

        // needed to pull this out of viewportOptions because of pixi.js v4 support (which changed from PIXI.ticker.shared to PIXI.Ticker.shared...sigh)
        if (options.ticker)
        {
            this.options.ticker = options.ticker;
        }
        else
        {
            // to avoid Rollup transforming our import, save pixi namespace in a variable
            // from here: https://github.com/pixijs/pixi.js/issues/5757
            let ticker;
            const pixiNS = PIXI;
            if (parseInt(/^(\d+)\./.exec(VERSION)[1]) < 5)
            {
                ticker = pixiNS.ticker.shared;
            }
            else
            {
                ticker = pixiNS.Ticker.shared;
            }
            this.options.ticker = options.ticker || ticker;
        }

        /** @type {number} */
        this.screenWidth = this.options.screenWidth;

        /** @type {number} */
        this.screenHeight = this.options.screenHeight;

        this._worldWidth = this.options.worldWidth;
        this._worldHeight = this.options.worldHeight;
        this.forceHitArea = this.options.forceHitArea;

        /**
         * number of pixels to move to trigger an input event (e.g., drag, pinch) or disable a clicked event
         * @type {number}
         */
        this.threshold = this.options.threshold;

        this.options.divWheel = this.options.divWheel || document.body;

        if (this.options.disableOnContextMenu)
        {
            this.options.divWheel.oncontextmenu = e => e.preventDefault();
        }

        if (!this.options.noTicker)
        {
            this.tickerFunction = () => this.update(this.options.ticker.elapsedMS);
            this.options.ticker.add(this.tickerFunction);
        }

        this.input = new InputManager(this);

        /**
         * Use this to add user plugins or access existing plugins (e.g., to pause, resume, or remove them)
         * @type {PluginManager}
         */
        this.plugins = new PluginManager(this);
    }

    /**
     * overrides PIXI.Container's destroy to also remove the 'wheel' and PIXI.Ticker listeners
     * @param {(object|boolean)} [options] - Options parameter. A boolean will act as if all options have been set to that value
     * @param {boolean} [options.children=false] - if set to true, all the children will have their destroy method called as well. 'options' will be passed on to those calls.
     * @param {boolean} [options.texture=false] - Only used for child Sprites if options.children is set to true. Should it destroy the texture of the child sprite
     * @param {boolean} [options.baseTexture=false] - Only used for child Sprites if options.children is set to true. Should it destroy the base texture of the child sprite     */
    destroy(options)
    {
        if (!this.options.noTicker)
        {
            this.options.ticker.remove(this.tickerFunction);
        }
        this.input.destroy();
        super.destroy(options);
    }

    /**
     * update viewport on each frame
     * by default, you do not need to call this unless you set options.noTicker=true
     * @param {number} elapsed time in milliseconds since last update
     */
    update(elapsed)
    {
        if (!this.pause)
        {
            this.plugins.update(elapsed);

            if (this.lastViewport)
            {
                // check for moved-end event
                if (this.lastViewport.x !== this.x || this.lastViewport.y !== this.y)
                {
                    this.moving = true;
                }
                else
                {
                    if (this.moving)
                    {
                        this.emit('moved-end', this);
                        this.moving = false;
                    }
                }
                // check for zoomed-end event
                if (this.lastViewport.scaleX !== this.scale.x || this.lastViewport.scaleY !== this.scale.y)
                {
                    this.zooming = true;
                }
                else
                {
                    if (this.zooming)
                    {
                        this.emit('zoomed-end', this);
                        this.zooming = false;
                    }
                }
            }

            if (!this.forceHitArea)
            {
                this._hitAreaDefault = new Rectangle(this.left, this.top, this.worldScreenWidth, this.worldScreenHeight);
                this.hitArea = this._hitAreaDefault;
            }

            this._dirty = this._dirty || !this.lastViewport ||
                this.lastViewport.x !== this.x || this.lastViewport.y !== this.y ||
                this.lastViewport.scaleX !== this.scale.x || this.lastViewport.scaleY !== this.scale.y;

            this.lastViewport = {
                x: this.x,
                y: this.y,
                scaleX: this.scale.x,
                scaleY: this.scale.y
            };
            this.emit('frame-end', this);
        }
    }

    /**
     * use this to set screen and world sizes--needed for pinch/wheel/clamp/bounce
     * @param {number} [screenWidth=window.innerWidth]
     * @param {number} [screenHeight=window.innerHeight]
     * @param {number} [worldWidth]
     * @param {number} [worldHeight]
     */
    resize(screenWidth = window.innerWidth, screenHeight = window.innerHeight, worldWidth, worldHeight)
    {
        this.screenWidth = screenWidth;
        this.screenHeight = screenHeight;
        if (typeof worldWidth !== 'undefined')
        {
            this._worldWidth = worldWidth;
        }
        if (typeof worldHeight !== 'undefined')
        {
            this._worldHeight = worldHeight;
        }
        this.plugins.resize();
    }

    /**
     * world width in pixels
     * @type {number}
     */
    get worldWidth()
    {
        if (this._worldWidth)
        {
            return this._worldWidth
        }
        else
        {
            return this.width / this.scale.x
        }
    }
    set worldWidth(value)
    {
        this._worldWidth = value;
        this.plugins.resize();
    }

    /**
     * world height in pixels
     * @type {number}
     */
    get worldHeight()
    {
        if (this._worldHeight)
        {
            return this._worldHeight
        }
        else
        {
            return this.height / this.scale.y
        }
    }
    set worldHeight(value)
    {
        this._worldHeight = value;
        this.plugins.resize();
    }

    /**
     * get visible bounds of viewport
     * @returns {PIXI.Rectangle}
     */
    getVisibleBounds()
    {
        return new Rectangle(this.left, this.top, this.worldScreenWidth, this.worldScreenHeight)
    }

    /**
     * change coordinates from screen to world
     * @param {(number|PIXI.Point)} x or point
     * @param {number} [y]
     * @return {PIXI.Point}
     */
    toWorld(x, y)
    {
        if (arguments.length === 2)
        {
            return this.toLocal(new Point(x, y))
        }
        else
        {
            return this.toLocal(x)
        }
    }

    /**
     * change coordinates from world to screen
     * @param {(number|PIXI.Point)} x or point
     * @param {number} [y]
     * @return {PIXI.Point}
     */
    toScreen(x, y)
    {
        if (arguments.length === 2)
        {
            return this.toGlobal(new Point(x, y))
        }
        else
        {
            return this.toGlobal(x)
        }
    }

    /**
     * screen width in world coordinates
     * @type {number}
     */
    get worldScreenWidth()
    {
        return this.screenWidth / this.scale.x
    }

    /**
     * screen height in world coordinates
     * @type {number}
     */
    get worldScreenHeight()
    {
        return this.screenHeight / this.scale.y
    }

    /**
     * world width in screen coordinates
     * @type {number}
     */
    get screenWorldWidth()
    {
        return this.worldWidth * this.scale.x
    }

    /**
     * world height in screen coordinates
     * @type {number}
     */
    get screenWorldHeight()
    {
        return this.worldHeight * this.scale.y
    }

    /**
     * center of screen in world coordinates
     * @type {PIXI.Point}
     */
    get center()
    {
        return new Point(this.worldScreenWidth / 2 - this.x / this.scale.x, this.worldScreenHeight / 2 - this.y / this.scale.y)
    }
    set center(value)
    {
        this.moveCenter(value);
    }

    /**
     * move center of viewport to point
     * @param {(number|PIXI.Point)} x or point
     * @param {number} [y]
     * @return {Viewport} this
     */
    moveCenter()
    {
        let x, y;
        if (!isNaN(arguments[0]))
        {
            x = arguments[0];
            y = arguments[1];
        }
        else
        {
            x = arguments[0].x;
            y = arguments[0].y;
        }
        this.position.set((this.worldScreenWidth / 2 - x) * this.scale.x, (this.worldScreenHeight / 2 - y) * this.scale.y);
        this.plugins.reset();
        this.dirty = true;
        return this
    }

    /**
     * top-left corner of Viewport
     * @type {PIXI.Point}
     */
    get corner()
    {
        return new Point(-this.x / this.scale.x, -this.y / this.scale.y)
    }
    set corner(value)
    {
        this.moveCorner(value);
    }

    /**
     * move viewport's top-left corner; also clamps and resets decelerate and bounce (as needed)
     * @param {(number|PIXI.Point)} x or point
     * @param {number} [y]
     * @return {Viewport} this
     */
    moveCorner(x, y)
    {
        if (arguments.length === 1)
        {
            this.position.set(-x.x * this.scale.x, -x.y * this.scale.y);
        }
        else
        {
            this.position.set(-x * this.scale.x, -y * this.scale.y);
        }
        this.plugins.reset();
        return this
    }

    /**
     * change zoom so the width fits in the viewport
     * @param {number} [width=this.worldWidth] in world coordinates
     * @param {boolean} [center] maintain the same center
     * @param {boolean} [scaleY=true] whether to set scaleY=scaleX
     * @param {boolean} [noClamp] whether to disable clamp-zoom
     * @returns {Viewport} this
     */
    fitWidth(width, center, scaleY = true, noClamp)
    {
        let save;
        if (center)
        {
            save = this.center;
        }
        this.scale.x = this.screenWidth / width;

        if (scaleY)
        {
            this.scale.y = this.scale.x;
        }

        const clampZoom = this.plugins.get('clamp-zoom');
        if (!noClamp && clampZoom)
        {
            clampZoom.clamp();
        }

        if (center)
        {
            this.moveCenter(save);
        }
        return this
    }

    /**
     * change zoom so the height fits in the viewport
     * @param {number} [height=this.worldHeight] in world coordinates
     * @param {boolean} [center] maintain the same center of the screen after zoom
     * @param {boolean} [scaleX=true] whether to set scaleX = scaleY
     * @param {boolean} [noClamp] whether to disable clamp-zoom
     * @returns {Viewport} this
     */
    fitHeight(height, center, scaleX = true, noClamp)
    {
        let save;
        if (center)
        {
            save = this.center;
        }
        this.scale.y = this.screenHeight / height;

        if (scaleX)
        {
            this.scale.x = this.scale.y;
        }

        const clampZoom = this.plugins.get('clamp-zoom');
        if (!noClamp && clampZoom)
        {
            clampZoom.clamp();
        }

        if (center)
        {
            this.moveCenter(save);
        }
        return this
    }

    /**
     * change zoom so it fits the entire world in the viewport
     * @param {boolean} center maintain the same center of the screen after zoom
     * @returns {Viewport} this
     */
    fitWorld(center)
    {
        let save;
        if (center)
        {
            save = this.center;
        }
        this.scale.x = this.screenWidth / this.worldWidth;
        this.scale.y = this.screenHeight / this.worldHeight;
        if (this.scale.x < this.scale.y)
        {
            this.scale.y = this.scale.x;
        }
        else
        {
            this.scale.x = this.scale.y;
        }

        const clampZoom = this.plugins.get('clamp-zoom');
        if (clampZoom)
        {
            clampZoom.clamp();
        }

        if (center)
        {
            this.moveCenter(save);
        }
        return this
    }

    /**
     * change zoom so it fits the size or the entire world in the viewport
     * @param {boolean} [center] maintain the same center of the screen after zoom
     * @param {number} [width=this.worldWidth] desired width
     * @param {number} [height=this.worldHeight] desired height
     * @returns {Viewport} this
     */
    fit(center, width = this.worldWidth, height = this.worldHeight)
    {
        let save;
        if (center)
        {
            save = this.center;
        }
        this.scale.x = this.screenWidth / width;
        this.scale.y = this.screenHeight / height;
        if (this.scale.x < this.scale.y)
        {
            this.scale.y = this.scale.x;
        }
        else
        {
            this.scale.x = this.scale.y;
        }
        const clampZoom = this.plugins.get('clamp-zoom');
        if (clampZoom)
        {
            clampZoom.clamp();
        }
        if (center)
        {
            this.moveCenter(save);
        }
        return this
    }

    /**
     * zoom viewport to specific value
     * @param {number} scale value (e.g., 1 would be 100%, 0.25 would be 25%)
     * @param {boolean} [center] maintain the same center of the screen after zoom
     * @return {Viewport} this
     */
    setZoom(scale, center)
    {
        let save;
        if (center)
        {
            save = this.center;
        }
        this.scale.set(scale);
        const clampZoom = this.plugins.get('clamp-zoom');
        if (clampZoom)
        {
            clampZoom.clamp();
        }
        if (center)
        {
            this.moveCenter(save);
        }
        return this
    }

    /**
     * zoom viewport by a certain percent (in both x and y direction)
     * @param {number} percent change (e.g., 0.25 would increase a starting scale of 1.0 to 1.25)
     * @param {boolean} [center] maintain the same center of the screen after zoom
     * @return {Viewport} this
     */
    zoomPercent(percent, center)
    {
        return this.setZoom(this.scale.x + this.scale.x * percent, center)
    }

    /**
     * zoom viewport by increasing/decreasing width by a certain number of pixels
     * @param {number} change in pixels
     * @param {boolean} [center] maintain the same center of the screen after zoom
     * @return {Viewport} this
     */
    zoom(change, center)
    {
        this.fitWidth(change + this.worldScreenWidth, center);
        return this
    }

    /**
     * changes scale of viewport and maintains center of viewport--same as calling setScale(scale, true)
     * @type {number}
     */
    set scaled(scale)
    {
        this.setZoom(scale, true);
    }
    get scaled()
    {
        return this.scale.x
    }

    /**
     * @param {SnapZoomOptions} options
     */
    snapZoom(options)
    {
        this.plugins.add('snap-zoom', new SnapZoom(this, options));
        return this
    }

    /**
     * is container out of world bounds
     * @returns {OutOfBounds}
     */
    OOB()
    {
        return {
            left: this.left < 0,
            right: this.right > this._worldWidth,
            top: this.top < 0,
            bottom: this.bottom > this._worldHeight,
            cornerPoint: new Point(
                this._worldWidth * this.scale.x - this.screenWidth,
                this._worldHeight * this.scale.y - this.screenHeight
            )
        }
    }

    /**
     * world coordinates of the right edge of the screen
     * @type {number}
     */
    get right()
    {
        return -this.x / this.scale.x + this.worldScreenWidth
    }
    set right(value)
    {
        this.x = -value * this.scale.x + this.screenWidth;
        this.plugins.reset();
    }

    /**
     * world coordinates of the left edge of the screen
     * @type { number }
     */
    get left()
    {
        return -this.x / this.scale.x
    }
    set left(value)
    {
        this.x = -value * this.scale.x;
        this.plugins.reset();
    }

    /**
     * world coordinates of the top edge of the screen
     * @type {number}
     */
    get top()
    {
        return -this.y / this.scale.y
    }
    set top(value)
    {
        this.y = -value * this.scale.y;
        this.plugins.reset();
    }

    /**
     * world coordinates of the bottom edge of the screen
     * @type {number}
     */
    get bottom()
    {
        return -this.y / this.scale.y + this.worldScreenHeight
    }
    set bottom(value)
    {
        this.y = -value * this.scale.y + this.screenHeight;
        this.plugins.reset();
    }

    /**
     * determines whether the viewport is dirty (i.e., needs to be renderered to the screen because of a change)
     * @type {boolean}
     */
    get dirty()
    {
        return this._dirty
    }
    set dirty(value)
    {
        this._dirty = value;
    }

    /**
     * permanently changes the Viewport's hitArea
     * NOTE: if not set then hitArea = PIXI.Rectangle(Viewport.left, Viewport.top, Viewport.worldScreenWidth, Viewport.worldScreenHeight)
     * @returns {HitArea}
     */
    get forceHitArea()
    {
        return this._forceHitArea
    }
    set forceHitArea(value)
    {
        if (value)
        {
            this._forceHitArea = value;
            this.hitArea = value;
        }
        else
        {
            this._forceHitArea = null;
            this.hitArea = new Rectangle(0, 0, this.worldWidth, this.worldHeight);
        }
    }

    /**
     * enable one-finger touch to drag
     * NOTE: if you expect users to use right-click dragging, you should enable viewport.options.disableOnContextMenu to avoid the context menu popping up on each right-click drag
     * @param {DragOptions} [options]
     * @returns {Viewport} this
     */
    drag(options)
    {
        this.plugins.add('drag', new Drag(this, options));
        return this
    }

    /**
     * clamp to world boundaries or other provided boundaries
     * NOTES:
     *   clamp is disabled if called with no options; use { direction: 'all' } for all edge clamping
     *   screenWidth, screenHeight, worldWidth, and worldHeight needs to be set for this to work properly
     * @param {ClampOptions} [options]
     * @returns {Viewport} this
     */
    clamp(options)
    {
        this.plugins.add('clamp', new Clamp(this, options));
        return this
    }

    /**
     * decelerate after a move
     * NOTE: this fires 'moved' event during deceleration
     * @param {DecelerateOptions} [options]
     * @return {Viewport} this
     */
    decelerate(options)
    {
        this.plugins.add('decelerate', new Decelerate(this, options));
        return this
    }

    /**
     * bounce on borders
     * NOTES:
     *    screenWidth, screenHeight, worldWidth, and worldHeight needs to be set for this to work properly
     *    fires 'moved', 'bounce-x-start', 'bounce-y-start', 'bounce-x-end', and 'bounce-y-end' events
     * @param {object} [options]
     * @param {string} [options.sides=all] all, horizontal, vertical, or combination of top, bottom, right, left (e.g., 'top-bottom-right')
     * @param {number} [options.friction=0.5] friction to apply to decelerate if active
     * @param {number} [options.time=150] time in ms to finish bounce
     * @param {string|function} [options.ease=easeInOutSine] ease function or name (see http://easings.net/ for supported names)
     * @param {string} [options.underflow=center] (top/bottom/center and left/right/center, or center) where to place world if too small for screen
     * @return {Viewport} this
     */
    bounce(options)
    {
        this.plugins.add('bounce', new Bounce(this, options));
        return this
    }

    /**
     * enable pinch to zoom and two-finger touch to drag
     * @param {PinchOptions} [options]
     * @return {Viewport} this
     */
    pinch(options)
    {
        this.plugins.add('pinch', new Pinch(this, options));
        return this
    }

    /**
     * snap to a point
     * @param {number} x
     * @param {number} y
     * @param {SnapOptions} [options]
     * @return {Viewport} this
     */
    snap(x, y, options)
    {
        this.plugins.add('snap', new Snap(this, x, y, options));
        return this
    }

    /**
     * follow a target
     * NOTES:
     *    uses the (x, y) as the center to follow; for PIXI.Sprite to work properly, use sprite.anchor.set(0.5)
     *    options.acceleration is not perfect as it doesn't know the velocity of the target
     *    it adds acceleration to the start of movement and deceleration to the end of movement when the target is stopped
     *    fires 'moved' event
     * @param {PIXI.DisplayObject} target to follow
     * @param {FollowOptions} [options]
     * @returns {Viewport} this
     */
    follow(target, options)
    {
        this.plugins.add('follow', new Follow(this, target, options));
        return this
    }

    /**
     * zoom using mouse wheel
     * @param {WheelOptions} [options]
     * @return {Viewport} this
     */
    wheel(options)
    {
        this.plugins.add('wheel', new Wheel(this, options));
        return this
    }

    /**
     * enable clamping of zoom to constraints
     * @param {ClampZoomOptions} [options]
     * @return {Viewport} this
     */
    clampZoom(options)
    {
        this.plugins.add('clamp-zoom', new ClampZoom(this, options));
        return this
    }

    /**
     * Scroll viewport when mouse hovers near one of the edges or radius-distance from center of screen.
     * NOTE: fires 'moved' event
     * @param {MouseEdgesOptions} [options]
     */
    mouseEdges(options)
    {
        this.plugins.add('mouse-edges', new MouseEdges(this, options));
        return this
    }

    /**
     * pause viewport (including animation updates such as decelerate)
     * @type {boolean}
     */
    get pause()
    {
        return this._pause
    }
    set pause(value)
    {
        this._pause = value;
        this.lastViewport = null;
        this.moving = false;
        this.zooming = false;
        if (value)
        {
            this.input.pause();
        }
    }

    /**
     * move the viewport so the bounding box is visible
     * @param {number} x - left
     * @param {number} y - top
     * @param {number} width
     * @param {number} height
     */
    ensureVisible(x, y, width, height)
    {
        if (x < this.left)
        {
            this.left = x;
        }
        else if (x + width > this.right)
        {
            this.right = x + width;
        }
        if (y < this.top)
        {
            this.top = y;
        }
        else if (y + height > this.bottom)
        {
            this.bottom = y + height;
        }
    }
}

var commonjsGlobal$1 = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

function createCommonjsModule$1(fn, module) {
	return module = { exports: {} }, fn(module, module.exports), module.exports;
}

var penner$1 = createCommonjsModule$1(function (module, exports) {
/*
	Copyright © 2001 Robert Penner
	All rights reserved.

	Redistribution and use in source and binary forms, with or without modification, 
	are permitted provided that the following conditions are met:

	Redistributions of source code must retain the above copyright notice, this list of 
	conditions and the following disclaimer.
	Redistributions in binary form must reproduce the above copyright notice, this list 
	of conditions and the following disclaimer in the documentation and/or other materials 
	provided with the distribution.

	Neither the name of the author nor the names of contributors may be used to endorse 
	or promote products derived from this software without specific prior written permission.

	THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY 
	EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
	MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
	COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
	EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE
	GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED 
	AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
	NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED 
	OF THE POSSIBILITY OF SUCH DAMAGE.
 */

(function() {
  var penner, umd;

  umd = function(factory) {
    {
      return module.exports = factory;
    }
  };

  penner = {
    linear: function(t, b, c, d) {
      return c * t / d + b;
    },
    easeInQuad: function(t, b, c, d) {
      return c * (t /= d) * t + b;
    },
    easeOutQuad: function(t, b, c, d) {
      return -c * (t /= d) * (t - 2) + b;
    },
    easeInOutQuad: function(t, b, c, d) {
      if ((t /= d / 2) < 1) {
        return c / 2 * t * t + b;
      } else {
        return -c / 2 * ((--t) * (t - 2) - 1) + b;
      }
    },
    easeInCubic: function(t, b, c, d) {
      return c * (t /= d) * t * t + b;
    },
    easeOutCubic: function(t, b, c, d) {
      return c * ((t = t / d - 1) * t * t + 1) + b;
    },
    easeInOutCubic: function(t, b, c, d) {
      if ((t /= d / 2) < 1) {
        return c / 2 * t * t * t + b;
      } else {
        return c / 2 * ((t -= 2) * t * t + 2) + b;
      }
    },
    easeInQuart: function(t, b, c, d) {
      return c * (t /= d) * t * t * t + b;
    },
    easeOutQuart: function(t, b, c, d) {
      return -c * ((t = t / d - 1) * t * t * t - 1) + b;
    },
    easeInOutQuart: function(t, b, c, d) {
      if ((t /= d / 2) < 1) {
        return c / 2 * t * t * t * t + b;
      } else {
        return -c / 2 * ((t -= 2) * t * t * t - 2) + b;
      }
    },
    easeInQuint: function(t, b, c, d) {
      return c * (t /= d) * t * t * t * t + b;
    },
    easeOutQuint: function(t, b, c, d) {
      return c * ((t = t / d - 1) * t * t * t * t + 1) + b;
    },
    easeInOutQuint: function(t, b, c, d) {
      if ((t /= d / 2) < 1) {
        return c / 2 * t * t * t * t * t + b;
      } else {
        return c / 2 * ((t -= 2) * t * t * t * t + 2) + b;
      }
    },
    easeInSine: function(t, b, c, d) {
      return -c * Math.cos(t / d * (Math.PI / 2)) + c + b;
    },
    easeOutSine: function(t, b, c, d) {
      return c * Math.sin(t / d * (Math.PI / 2)) + b;
    },
    easeInOutSine: function(t, b, c, d) {
      return -c / 2 * (Math.cos(Math.PI * t / d) - 1) + b;
    },
    easeInExpo: function(t, b, c, d) {
      if (t === 0) {
        return b;
      } else {
        return c * Math.pow(2, 10 * (t / d - 1)) + b;
      }
    },
    easeOutExpo: function(t, b, c, d) {
      if (t === d) {
        return b + c;
      } else {
        return c * (-Math.pow(2, -10 * t / d) + 1) + b;
      }
    },
    easeInOutExpo: function(t, b, c, d) {
      if ((t /= d / 2) < 1) {
        return c / 2 * Math.pow(2, 10 * (t - 1)) + b;
      } else {
        return c / 2 * (-Math.pow(2, -10 * --t) + 2) + b;
      }
    },
    easeInCirc: function(t, b, c, d) {
      return -c * (Math.sqrt(1 - (t /= d) * t) - 1) + b;
    },
    easeOutCirc: function(t, b, c, d) {
      return c * Math.sqrt(1 - (t = t / d - 1) * t) + b;
    },
    easeInOutCirc: function(t, b, c, d) {
      if ((t /= d / 2) < 1) {
        return -c / 2 * (Math.sqrt(1 - t * t) - 1) + b;
      } else {
        return c / 2 * (Math.sqrt(1 - (t -= 2) * t) + 1) + b;
      }
    },
    easeInElastic: function(t, b, c, d) {
      var a, p, s;
      s = 1.70158;
      p = 0;
      a = c;
      if (t === 0) ; else if ((t /= d) === 1) ;
      if (!p) {
        p = d * .3;
      }
      if (a < Math.abs(c)) {
        a = c;
        s = p / 4;
      } else {
        s = p / (2 * Math.PI) * Math.asin(c / a);
      }
      return -(a * Math.pow(2, 10 * (t -= 1)) * Math.sin((t * d - s) * (2 * Math.PI) / p)) + b;
    },
    easeOutElastic: function(t, b, c, d) {
      var a, p, s;
      s = 1.70158;
      p = 0;
      a = c;
      if (t === 0) ; else if ((t /= d) === 1) ;
      if (!p) {
        p = d * .3;
      }
      if (a < Math.abs(c)) {
        a = c;
        s = p / 4;
      } else {
        s = p / (2 * Math.PI) * Math.asin(c / a);
      }
      return a * Math.pow(2, -10 * t) * Math.sin((t * d - s) * (2 * Math.PI) / p) + c + b;
    },
    easeInOutElastic: function(t, b, c, d) {
      var a, p, s;
      s = 1.70158;
      p = 0;
      a = c;
      if (t === 0) ; else if ((t /= d / 2) === 2) ;
      if (!p) {
        p = d * (.3 * 1.5);
      }
      if (a < Math.abs(c)) {
        a = c;
        s = p / 4;
      } else {
        s = p / (2 * Math.PI) * Math.asin(c / a);
      }
      if (t < 1) {
        return -.5 * (a * Math.pow(2, 10 * (t -= 1)) * Math.sin((t * d - s) * (2 * Math.PI) / p)) + b;
      } else {
        return a * Math.pow(2, -10 * (t -= 1)) * Math.sin((t * d - s) * (2 * Math.PI) / p) * .5 + c + b;
      }
    },
    easeInBack: function(t, b, c, d, s) {
      if (s === void 0) {
        s = 1.70158;
      }
      return c * (t /= d) * t * ((s + 1) * t - s) + b;
    },
    easeOutBack: function(t, b, c, d, s) {
      if (s === void 0) {
        s = 1.70158;
      }
      return c * ((t = t / d - 1) * t * ((s + 1) * t + s) + 1) + b;
    },
    easeInOutBack: function(t, b, c, d, s) {
      if (s === void 0) {
        s = 1.70158;
      }
      if ((t /= d / 2) < 1) {
        return c / 2 * (t * t * (((s *= 1.525) + 1) * t - s)) + b;
      } else {
        return c / 2 * ((t -= 2) * t * (((s *= 1.525) + 1) * t + s) + 2) + b;
      }
    },
    easeInBounce: function(t, b, c, d) {
      var v;
      v = penner.easeOutBounce(d - t, 0, c, d);
      return c - v + b;
    },
    easeOutBounce: function(t, b, c, d) {
      if ((t /= d) < 1 / 2.75) {
        return c * (7.5625 * t * t) + b;
      } else if (t < 2 / 2.75) {
        return c * (7.5625 * (t -= 1.5 / 2.75) * t + .75) + b;
      } else if (t < 2.5 / 2.75) {
        return c * (7.5625 * (t -= 2.25 / 2.75) * t + .9375) + b;
      } else {
        return c * (7.5625 * (t -= 2.625 / 2.75) * t + .984375) + b;
      }
    },
    easeInOutBounce: function(t, b, c, d) {
      var v;
      if (t < d / 2) {
        v = penner.easeInBounce(t * 2, 0, c, d);
        return v * .5 + b;
      } else {
        v = penner.easeOutBounce(t * 2 - d, 0, c, d);
        return v * .5 + c * .5 + b;
      }
    }
  };

  umd(penner);

}).call(commonjsGlobal$1);
});

const scrollboxOptions = {
    'boxWidth': 100,
    'boxHeight': 100,
    'scrollbarSize': 10,
    'scrollbarBackground': 14540253,
    'scrollbarBackgroundAlpha': 1,
    'scrollbarForeground': 8947848,
    'scrollbarForegroundAlpha': 1,
    'dragScroll': true,
    'stopPropagation': true,
    'scrollbarOffsetHorizontal': 0,
    'scrollbarOffsetVertical': 0,
    'underflow': 'top-left',
    'fadeScrollbar': false,
    'fadeScrollbarTime': 1000,
    'fadeScrollboxWait': 3000,
    'fadeScrollboxEase': 'easeInOutSine',
    'passiveWheel': false,
    'clampWheel': true
};

/**
 * pixi.js scrollbox: a masked content box that can scroll vertically or horizontally with scrollbars
 */
class Scrollbox extends Container
{
    /**
     * create a scrollbox
     * @param {object} options
     * @param {boolean} [options.dragScroll=true] user may drag the content area to scroll content
     * @param {string} [options.overflowX=auto] (none, scroll, hidden, auto) this changes whether the scrollbar is shown
     * @param {string} [options.overflowY=auto] (none, scroll, hidden, auto) this changes whether the scrollbar is shown
     * @param {string} [options.overflow] (none, scroll, hidden, auto) sets overflowX and overflowY to this value
     * @param {number} [options.boxWidth=100] width of scrollbox including scrollbar (in pixels)
     * @param {number} [options.boxHeight=100] height of scrollbox including scrollbar (in pixels)
     * @param {number} [options.scrollbarSize=10] size of scrollbar (in pixels)
     * @param {number} [options.scrollbarOffsetHorizontal=0] offset of horizontal scrollbar (in pixels)
     * @param {number} [options.scrollbarOffsetVertical=0] offset of vertical scrollbar (in pixels)
     * @param {boolean} [options.stopPropagation=true] call stopPropagation on any events that impact scrollbox
     * @param {number} [options.scrollbarBackground=0xdddddd] background color of scrollbar
     * @param {number} [options.scrollbarBackgroundAlpha=1] alpha of background of scrollbar
     * @param {number} [options.scrollbarForeground=0x888888] foreground color of scrollbar
     * @param {number} [options.scrollbarForegroundAlpha=1] alpha of foreground of scrollbar
     * @param {string} [options.underflow=top-left] what to do when content underflows the scrollbox size: none: do nothing; (left/right/center AND top/bottom/center); OR center (e.g., 'top-left', 'center', 'none', 'bottomright')
     * @param {boolean} [options.noTicker] do not use PIXI.Ticker (for fade to work properly you will need to manually call updateLoop(elapsed) on each frame)
     * @param {PIXI.Ticker} [options.ticker=PIXI.Ticker.shared] use this PIXI.Ticker for updates
     * @param {boolean} [options.fade] fade the scrollbar when not in use
     * @param {number} [options.fadeScrollbarTime=1000] time to fade scrollbar if options.fade is set
     * @param {number} [options.fadeScrollboxWait=3000] time to wait before fading the scrollbar if options.fade is set
     * @param {(string|function)} [options.fadeScrollboxEase=easeInOutSine] easing function to use for fading
     * @param {boolean} [options.passiveWheel=false] whether wheel events are propogated beyond the scrollbox (NOTE: default is now false)
     * @param {boolean} [options.clampWheel=true] wheel events should be clamped (to avoid weird bounce with mouse wheel)
     */
    constructor(options={})
    {
        super();
        this.options = Object.assign({}, scrollboxOptions, options);
        this.ease = typeof this.options.fadeScrollboxEase === 'function' ? this.options.fadeScrollboxEase : penner$1[this.options.fadeScrollboxEase];

        /**
         * content in placed in here
         * you can use any function from pixi-viewport on content to manually move the content (see https://davidfig.github.io/pixi-viewport/jsdoc/)
         * @type {Viewport}
         */
        this.content = this.addChild(new Viewport({ passiveWheel: this.options.passiveWheel, stopPropagation: this.options.stopPropagation, screenWidth: this.options.boxWidth, screenHeight: this.options.boxHeight }));
        this.content
            .decelerate()
            .on('moved', () => this._drawScrollbars());

        // needed to pull this out of viewportOptions because of pixi.js v4 support (which changed from PIXI.ticker.shared to PIXI.Ticker.shared...sigh)
        if (options.ticker)
        {
            this.options.ticker = options.ticker;
        }
        else
        {
            // to avoid Rollup transforming our import, save pixi namespace in a variable
            // from here: https://github.com/pixijs/pixi.js/issues/5757
            let ticker;
            const pixiNS = PIXI;
            if (parseInt(/^(\d+)\./.exec(VERSION)[1]) < 5)
            {
                ticker = pixiNS.ticker.shared;
            }
            else
            {
                ticker = pixiNS.Ticker.shared;
            }
            this.options.ticker = options.ticker || ticker;
        }

        /**
         * graphics element for drawing the scrollbars
         * @type {PIXI.Graphics}
         */
        this.scrollbar = this.addChild(new Graphics());
        this.scrollbar.interactive = true;
        this.scrollbar.on('pointerdown', this.scrollbarDown, this);
        this.interactive = true;
        this.on('pointermove', this.scrollbarMove, this);
        this.on('pointerup', this.scrollbarUp, this);
        this.on('pointercancel', this.scrollbarUp, this);
        this.on('pointerupoutside', this.scrollbarUp, this);
        this._maskContent = this.addChild(new Graphics());
        this.update();

        if (!this.options.noTicker)
        {
            this.tickerFunction = () => this.updateLoop(Math.min(this.options.ticker.elapsedMS, 16.6667));
            this.options.ticker.add(this.tickerFunction);
        }
    }

    /**
     * offset of horizontal scrollbar (in pixels)
     * @type {number}
     */
    get scrollbarOffsetHorizontal()
    {
        return this.options.scrollbarOffsetHorizontal
    }
    set scrollbarOffsetHorizontal(value)
    {
        this.options.scrollbarOffsetHorizontal = value;
    }

    /**
     * offset of vertical scrollbar (in pixels)
     * @type {number}
     */
    get scrollbarOffsetVertical()
    {
        return this.options.scrollbarOffsetVertical
    }
    set scrollbarOffsetVertical(value)
    {
        this.options.scrollbarOffsetVertical = value;
    }

    /**
     * disable the scrollbox (if set to true this will also remove the mask)
     * @type {boolean}
     */
    get disable()
    {
        return this._disabled
    }
    set disable(value)
    {
        if (this._disabled !== value)
        {
            this._disabled = value;
            this.update();
        }
    }

    /**
     * call stopPropagation on any events that impact scrollbox
     * @type {boolean}
     */
    get stopPropagation()
    {
        return this.options.stopPropagation
    }
    set stopPropagation(value)
    {
        this.options.stopPropagation = value;
    }

    /**
     * user may drag the content area to scroll content
     * @type {boolean}
     */
    get dragScroll()
    {
        return this.options.dragScroll
    }
    set dragScroll(value)
    {
        this.options.dragScroll = value;
        if (value)
        {
            this.content.drag();
        }
        else
        {
            if (typeof this.content.removePlugin !== 'undefined')
            {
                this.content.removePlugin('drag');
            }
            else
            {
                this.content.plugins.remove('drag');
            }
        }
        this.update();
    }

    /**
     * width of scrollbox including the scrollbar (if visible)- this changes the size and not the scale of the box
     * @type {number}
     */
    get boxWidth()
    {
        return this.options.boxWidth
    }
    set boxWidth(value)
    {
        this.options.boxWidth = value;
        this.content.screenWidth = value;
        this.update();
    }

    /**
     * sets overflowX and overflowY to (scroll, hidden, auto) changing whether the scrollbar is shown
     * scroll = always show scrollbar
     * hidden = hide overflow and do not show scrollbar
     * auto = if content is larger than box size, then show scrollbar
     * @type {string}
     */
    get overflow()
    {
        return this.options.overflow
    }
    set overflow(value)
    {
        this.options.overflow = value;
        this.options.overflowX = value;
        this.options.overflowY = value;
        this.update();
    }

    /**
     * sets overflowX to (scroll, hidden, auto) changing whether the scrollbar is shown
     * scroll = always show scrollbar
     * hidden = hide overflow and do not show scrollbar
     * auto = if content is larger than box size, then show scrollbar
     * @type {string}
     */
    get overflowX()
    {
        return this.options.overflowX
    }
    set overflowX(value)
    {
        this.options.overflowX = value;
        this.update();
    }

    /**
     * sets overflowY to (scroll, hidden, auto) changing whether the scrollbar is shown
     * scroll = always show scrollbar
     * hidden = hide overflow and do not show scrollbar
     * auto = if content is larger than box size, then show scrollbar
     * @type {string}
     */
    get overflowY()
    {
        return this.options.overflowY
    }
    set overflowY(value)
    {
        this.options.overflowY = value;
        this.update();
    }

    /**
     * height of scrollbox including the scrollbar (if visible) - this changes the size and not the scale of the box
     * @type {number}
     */
    get boxHeight()
    {
        return this.options.boxHeight
    }
    set boxHeight(value)
    {
        this.options.boxHeight = value;
        this.content.screenHeight = value;
        this.update();
    }

    /**
     * scrollbar size in pixels
     * @type {number}
     */
    get scrollbarSize()
    {
        return this.options.scrollbarSize
    }
    set scrollbarSize(value)
    {
        this.options.scrollbarSize = value;
    }

    /**
     * width of scrollbox less the scrollbar (if visible)
     * @type {number}
     * @readonly
     */
    get contentWidth()
    {
        return this.options.boxWidth - (this.isScrollbarVertical ? this.options.scrollbarSize : 0)
    }

    /**
     * height of scrollbox less the scrollbar (if visible)
     * @type {number}
     * @readonly
     */
    get contentHeight()
    {
        return this.options.boxHeight - (this.isScrollbarHorizontal ? this.options.scrollbarSize : 0)
    }

    /**
     * is the vertical scrollbar visible
     * @type {boolean}
     * @readonly
     */
    get isScrollbarVertical()
    {
        return this._isScrollbarVertical
    }

    /**
     * is the horizontal scrollbar visible
     * @type {boolean}
     * @readonly
     */
    get isScrollbarHorizontal()
    {
        return this._isScrollbarHorizontal
    }

    /**
     * top coordinate of scrollbar
     */
    get scrollTop()
    {
        return this.content.top
    }

    /**
     * left coordinate of scrollbar
     */
    get scrollLeft()
    {
        return this.content.left
    }

    /**
     * width of content area
     * if not set then it uses content.width to calculate width
     */
    get scrollWidth()
    {
        return this._scrollWidth || this.content.width
    }
    set scrollWidth(value)
    {
        this._scrollWidth = value;
    }

    /**
     * height of content area
     * if not set then it uses content.height to calculate height
     */
    get scrollHeight()
    {
        return this._scrollHeight || this.content.height
    }
    set scrollHeight(value)
    {
        this._scrollHeight = value;
    }

    /**
     * draws scrollbars
     * @private
     */
    _drawScrollbars()
    {
        this._isScrollbarHorizontal = this.overflowX === 'scroll' ? true : ['hidden', 'none'].indexOf(this.overflowX) !== -1 ? false : this.scrollWidth > this.options.boxWidth;
        this._isScrollbarVertical = this.overflowY === 'scroll' ? true : ['hidden', 'none'].indexOf(this.overflowY) !== -1 ? false : this.scrollHeight > this.options.boxHeight;
        this.scrollbar.clear();
        let options = {};
        options.left = 0;
        options.right = this.scrollWidth + (this._isScrollbarVertical ? this.options.scrollbarSize : 0);
        options.top = 0;
        options.bottom = this.scrollHeight + (this.isScrollbarHorizontal ? this.options.scrollbarSize : 0);
        const width = this.scrollWidth + (this.isScrollbarVertical ? this.options.scrollbarSize : 0);
        const height = this.scrollHeight + (this.isScrollbarHorizontal ? this.options.scrollbarSize : 0);
        this.scrollbarTop = (this.content.top / height) * this.boxHeight;
        this.scrollbarTop = this.scrollbarTop < 0 ? 0 : this.scrollbarTop;
        this.scrollbarHeight = (this.boxHeight / height) * this.boxHeight;
        this.scrollbarHeight = this.scrollbarTop + this.scrollbarHeight > this.boxHeight ? this.boxHeight - this.scrollbarTop : this.scrollbarHeight;
        this.scrollbarLeft = (this.content.left / width) * this.boxWidth;
        this.scrollbarLeft = this.scrollbarLeft < 0 ? 0 : this.scrollbarLeft;
        this.scrollbarWidth = (this.boxWidth / width) * this.boxWidth;
        this.scrollbarWidth = this.scrollbarWidth + this.scrollbarLeft > this.boxWidth ? this.boxWidth - this.scrollbarLeft : this.scrollbarWidth;
        if (this.isScrollbarVertical)
        {
            this.scrollbar
                .beginFill(this.options.scrollbarBackground, this.options.scrollbarBackgroundAlpha)
                .drawRect(this.boxWidth - this.scrollbarSize + this.options.scrollbarOffsetVertical, 0, this.scrollbarSize, this.boxHeight)
                .endFill();
        }
        if (this.isScrollbarHorizontal)
        {
            this.scrollbar
                .beginFill(this.options.scrollbarBackground, this.options.scrollbarBackgroundAlpha)
                .drawRect(0, this.boxHeight - this.scrollbarSize + this.options.scrollbarOffsetHorizontal, this.boxWidth, this.scrollbarSize)
                .endFill();
        }
        if (this.isScrollbarVertical)
        {
            this.scrollbar
                .beginFill(this.options.scrollbarForeground, this.options.scrollbarForegroundAlpha)
                .drawRect(this.boxWidth - this.scrollbarSize + this.options.scrollbarOffsetVertical, this.scrollbarTop, this.scrollbarSize, this.scrollbarHeight)
                .endFill();
        }
        if (this.isScrollbarHorizontal)
        {
            this.scrollbar
                .beginFill(this.options.scrollbarForeground, this.options.scrollbarForegroundAlpha)
                .drawRect(this.scrollbarLeft, this.boxHeight - this.scrollbarSize + this.options.scrollbarOffsetHorizontal, this.scrollbarWidth, this.scrollbarSize)
                .endFill();
        }
        // this.content.forceHitArea = new PIXI.Rectangle(0, 0 , this.boxWidth, this.boxHeight)
        this.activateFade();
    }

    /**
     * draws mask layer
     * @private
     */
    _drawMask()
    {
        this._maskContent
            .beginFill(0)
            .drawRect(0, 0, this.boxWidth, this.boxHeight)
            .endFill();
        this.content.mask = this._maskContent;
    }

    /**
     * call when scrollbox content changes
     */
    update()
    {
        this.content.mask = null;
        this._maskContent.clear();
        if (!this._disabled)
        {
            this._drawScrollbars();
            this._drawMask();
            if (this.options.dragScroll)
            {
                const direction = this.isScrollbarHorizontal && this.isScrollbarVertical ? 'all' : this.isScrollbarHorizontal ? 'x' : 'y';
                if (direction !== null)
                {
                    this.content
                        .drag({ clampWheel: this.options.clampWheel, direction })
                        .clamp({ direction, underflow: this.options.underflow });
                }
            }
        }
    }

    /**
     * called on each frame to update fade scrollbars (if enabled)
     * @param {number} elapsed since last frame in milliseconds (usually capped at 16.6667)
     */
    updateLoop(elapsed)
    {
        if (this.fade)
        {
            if (this.fade.wait > 0)
            {
                this.fade.wait -= elapsed;
                if (this.fade.wait <= 0)
                {
                    elapsed += this.fade.wait;
                }
                else
                {
                    return
                }
            }
            this.fade.duration += elapsed;
            if (this.fade.duration >= this.options.fadeScrollbarTime)
            {
                this.fade = null;
                this.scrollbar.alpha = 0;
            }
            else
            {
                this.scrollbar.alpha = this.ease(this.fade.duration, 1, -1, this.options.fadeScrollbarTime);
            }
            this.content.dirty = true;
        }
    }

    /**
     * dirty value (used for optimizing draws) for underlying viewport (scrollbox.content)
     * @type {boolean}
     */
    get dirty()
    {
        return this.content.dirty
    }
    set dirty(value)
    {
        this.content.dirty = value;
    }

    /**
     * show the scrollbar and restart the timer for fade if options.fade is set
     */
    activateFade()
    {
        if (!this.fade && this.options.fade)
        {
            this.scrollbar.alpha = 1;
            this.fade = { wait: this.options.fadeScrollboxWait, duration: 0 };
        }
    }

    /**
     * handle pointer down on scrollbar
     * @param {PIXI.interaction.InteractionEvent} e
     * @private
     */
    scrollbarDown(e)
    {
        const local = this.toLocal(e.data.global);
        if (this.isScrollbarHorizontal)
        {
            if (local.y > this.boxHeight - this.scrollbarSize)
            {
                if (local.x >= this.scrollbarLeft && local.x <= this.scrollbarLeft + this.scrollbarWidth)
                {
                    this.pointerDown = { type: 'horizontal', last: local };
                }
                else
                {
                    if (local.x > this.scrollbarLeft)
                    {
                        this.content.left += this.content.worldScreenWidth;
                        this.update();
                    }
                    else
                    {
                        this.content.left -= this.content.worldScreenWidth;
                        this.update();
                    }
                }
                if (this.options.stopPropagation)
                {
                    e.stopPropagation();
                }
                return
            }
        }
        if (this.isScrollbarVertical)
        {
            if (local.x > this.boxWidth - this.scrollbarSize)
            {
                if (local.y >= this.scrollbarTop && local.y <= this.scrollbarTop + this.scrollbarWidth)
                {
                    this.pointerDown = { type: 'vertical', last: local };
                }
                else
                {
                    if (local.y > this.scrollbarTop)
                    {
                        this.content.top += this.content.worldScreenHeight;
                        this.update();
                    }
                    else
                    {
                        this.content.top -= this.content.worldScreenHeight;
                        this.update();
                    }
                }
                if (this.options.stopPropagation)
                {
                    e.stopPropagation();
                }
                return
            }
        }
    }

    /**
     * handle pointer move on scrollbar
     * @param {PIXI.interaction.InteractionEvent} e
     * @private
     */
    scrollbarMove(e)
    {
        if (this.pointerDown)
        {
            if (this.pointerDown.type === 'horizontal')
            {
                const local = this.toLocal(e.data.global);
                this.content.left += local.x - this.pointerDown.last.x;
                this.pointerDown.last = local;
                this.update();
            }
            else if (this.pointerDown.type === 'vertical')
            {
                const local = this.toLocal(e.data.global);
                this.content.top += local.y - this.pointerDown.last.y;
                this.pointerDown.last = local;
                this.update();
            }
            if (this.options.stopPropagation)
            {
                e.stopPropagation();
            }
        }
    }

    /**
     * handle pointer down on scrollbar
     * @private
     */
    scrollbarUp()
    {
        this.pointerDown = null;
    }

    /**
     * resize the mask for the container
     * @param {object} options
     * @param {number} [options.boxWidth] width of scrollbox including scrollbar (in pixels)
     * @param {number} [options.boxHeight] height of scrollbox including scrollbar (in pixels)
     * @param {number} [options.scrollWidth] set the width of the inside of the scrollbox (leave null to use content.width)
     * @param {number} [options.scrollHeight] set the height of the inside of the scrollbox (leave null to use content.height)
     */
    resize(options)
    {
        this.options.boxWidth = typeof options.boxWidth !== 'undefined' ? options.boxWidth : this.options.boxWidth;
        this.options.boxHeight = typeof options.boxHeight !== 'undefined' ? options.boxHeight : this.options.boxHeight;
        if (options.scrollWidth)
        {
            this.scrollWidth = options.scrollWidth;
        }
        if (options.scrollHeight)
        {
            this.scrollHeight = options.scrollHeight;
        }
        this.content.resize(this.options.boxWidth, this.options.boxHeight, this.scrollWidth, this.scrollHeight);
        this.update();
    }

    /**
     * ensure that the bounding box is visible
     * @param {number} x - relative to content's coordinate system
     * @param {number} y
     * @param {number} width
     * @param {number} height
     */
    ensureVisible(x, y, width, height)
    {
        this.content.ensureVisible(x, y, width, height);
        this._drawScrollbars();
    }
}

var List = /** @class */ (function (_super) {
    __extends(List, _super);
    function List(_a) {
        var width = _a.width, height = _a.height, _b = _a.overflowX, overflowX = _b === void 0 ? 'hidden' : _b, _c = _a.overflowY, overflowY = _c === void 0 ? 'auto' : _c, _d = _a.cornerRadius, cornerRadius = _d === void 0 ? 0 : _d, _e = _a.scrollbarSize, scrollbarSize = _e === void 0 ? 5 : _e, rest = __rest(_a, ["width", "height", "overflowX", "overflowY", "cornerRadius", "scrollbarSize"]);
        var _this = _super.call(this) || this;
        var mask = _this.createGraphics(0, 0, width, height, cornerRadius);
        _this.mask = mask;
        _this.box = new Scrollbox(__assign({ boxWidth: width, boxHeight: height, overflowX: overflowX,
            overflowY: overflowY,
            scrollbarSize: scrollbarSize }, rest));
        _this.addChild(_this.box);
        return _this;
    }
    List.prototype.createGraphics = function (x, y, width, height, radius, color) {
        if (radius === void 0) { radius = 0; }
        if (color === void 0) { color = 0xffffff; }
        var graphic = new Graphics();
        graphic.beginFill(color);
        graphic.drawRoundedRect(x, y, width, height, radius);
        graphic.endFill();
        return graphic;
    };
    List.prototype.push = function (item) {
        this.box.content.addChild(item);
    };
    return List;
}(Container));

export default List;
//# sourceMappingURL=list.es.js.map
