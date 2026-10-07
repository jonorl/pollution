import * as THREE from 'three';

/**
 * The parts of three's OrbitControls the views use (rotate, pinch to zoom, damping and
 * auto-rotate), driven by gesture-handler events because OrbitControls listens for DOM pointer
 * events that React Native doesn't have. The maths follows OrbitControls, so the views feel the
 * same as on the web.
 */
export class Orbit {
  readonly target = new THREE.Vector3();
  minDistance = 0;
  maxDistance = Infinity;
  minPolarAngle = 0;
  maxPolarAngle = Math.PI;
  autoRotate = false;
  /** Turns per minute, as in OrbitControls: 2 is one turn every 30 seconds. */
  autoRotateSpeed = 2;
  dampingFactor = 0.06;

  private readonly camera: THREE.PerspectiveCamera;
  private readonly viewHeight: () => number;
  private readonly spherical = new THREE.Spherical();
  private readonly offset = new THREE.Vector3();
  private thetaDelta = 0;
  private phiDelta = 0;
  private scale = 1;
  private held = false;

  constructor(camera: THREE.PerspectiveCamera, viewHeight: () => number) {
    this.camera = camera;
    this.viewHeight = viewHeight;
  }

  /** While held, auto-rotate pauses as it does under a mouse. */
  hold(held: boolean): void {
    this.held = held;
  }

  /** A finger's movement in dp; a drag the height of the view turns the camera once round. */
  rotate(dx: number, dy: number): void {
    const height = this.viewHeight();
    this.thetaDelta -= (2 * Math.PI * dx) / height;
    this.phiDelta -= (2 * Math.PI * dy) / height;
  }

  /** A pinch's change in scale since the last event; spreading the fingers moves closer. */
  zoom(scaleChange: number): void {
    if (scaleChange > 0) this.scale /= scaleChange;
  }

  update(dt: number): void {
    this.offset.copy(this.camera.position).sub(this.target);
    this.spherical.setFromVector3(this.offset);

    if (this.autoRotate && !this.held) this.thetaDelta -= ((2 * Math.PI) / 60) * this.autoRotateSpeed * dt;
    this.spherical.theta += this.thetaDelta * this.dampingFactor;
    this.spherical.phi = THREE.MathUtils.clamp(
      this.spherical.phi + this.phiDelta * this.dampingFactor,
      this.minPolarAngle,
      this.maxPolarAngle,
    );
    this.spherical.makeSafe();
    this.spherical.radius = THREE.MathUtils.clamp(this.spherical.radius * this.scale, this.minDistance, this.maxDistance);

    this.thetaDelta *= 1 - this.dampingFactor;
    this.phiDelta *= 1 - this.dampingFactor;
    this.scale = 1;

    this.camera.position.copy(this.target).add(this.offset.setFromSpherical(this.spherical));
    this.camera.lookAt(this.target);
  }
}
