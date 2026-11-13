export const TILE = 32;

export interface CameraOptions {
  viewW: number;
  viewH: number;
  camX?: number;
  camY?: number;
  zoom?: number;
}

export class CameraController {
  public camX: number;
  public camY: number;
  public zoom: number;
  public cameraFollow = true;
  public autoRecenter = true;
  public viewW: number;
  public viewH: number;

  constructor(opts: CameraOptions) {
    this.viewW = opts.viewW;
    this.viewH = opts.viewH;
    this.camX = opts.camX ?? 0;
    this.camY = opts.camY ?? 0;
    this.zoom = opts.zoom ?? 1;
  }

  resize(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
  }

  pan(dx: number, dy: number): void {
    this.camX += dx;
    this.camY += dy;
  }

  edgePan(pointerX: number, pointerY: number, edgeSpeed = 8, edgeThreshold = 15): boolean {
    let edgeDx = 0;
    let edgeDy = 0;
    if (pointerX <= edgeThreshold) edgeDx += 1;
    else if (pointerX >= this.viewW - edgeThreshold) edgeDx -= 1;
    if (pointerY <= edgeThreshold) edgeDy += 1;
    else if (pointerY >= this.viewH - edgeThreshold) edgeDy -= 1;

    if (edgeDx !== 0 || edgeDy !== 0) {
      this.cameraFollow = false;
      this.pan(edgeDx * edgeSpeed, edgeDy * edgeSpeed);
      return true;
    }
    return false;
  }

  keyPan(keys: Set<string>, speed = 10): boolean {
    const kx = (keys.has('arrowleft') ? 1 : 0) - (keys.has('arrowright') ? 1 : 0);
    const ky = (keys.has('arrowup') ? 1 : 0) - (keys.has('arrowdown') ? 1 : 0);
    if (kx !== 0 || ky !== 0) {
      this.cameraFollow = false;
      this.pan(kx * speed, ky * speed);
      return true;
    }
    return false;
  }

  followHero(heroTileX: number, heroTileY: number, factor = 0.2): void {
    if (!this.cameraFollow && !this.autoRecenter) return;
    const targetCamX = heroTileX * TILE * this.zoom - this.viewW / 2;
    const targetCamY = heroTileY * TILE * this.zoom - this.viewH / 2;

    if (Math.abs(targetCamX - this.camX) < 1) this.camX = targetCamX;
    else this.camX += (targetCamX - this.camX) * factor;

    if (Math.abs(targetCamY - this.camY) < 1) this.camY = targetCamY;
    else this.camY += (targetCamY - this.camY) * factor;
  }

  zoomBy(dir: number, screenX = this.viewW / 2, screenY = this.viewH / 2, minZoom = 0.5, maxZoom = 2.5): void {
    const factor = dir > 0 ? 1.15 : 1 / 1.15;
    const newZoom = Math.min(maxZoom, Math.max(minZoom, this.zoom * factor));
    if (newZoom === this.zoom) return;

    // Anchor zoom to pointer
    const wx = (screenX + this.camX) / this.zoom;
    const wy = (screenY + this.camY) / this.zoom;
    this.zoom = newZoom;
    this.camX = wx * this.zoom - screenX;
    this.camY = wy * this.zoom - screenY;
  }

  clamp(mapW: number, mapH: number): void {
    const worldW = mapW * TILE * this.zoom;
    const worldH = mapH * TILE * this.zoom;
    const margin = 64;
    const minX = -margin;
    const maxX = Math.max(minX, worldW - this.viewW + margin);
    const minY = -margin;
    const maxY = Math.max(minY, worldH - this.viewH + margin);
    this.camX = Math.max(minX, Math.min(maxX, this.camX));
    this.camY = Math.max(minY, Math.min(maxY, this.camY));
  }

  tileToScreen(tx: number, ty: number): [number, number] {
    return [
      Math.round(tx * TILE * this.zoom - this.camX),
      Math.round(ty * TILE * this.zoom - this.camY),
    ];
  }

  screenToTile(sx: number, sy: number): [number, number] {
    return [
      (sx + this.camX) / (TILE * this.zoom),
      (sy + this.camY) / (TILE * this.zoom),
    ];
  }
}
