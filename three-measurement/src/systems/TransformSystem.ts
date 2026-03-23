import { System } from '../ecs/System';
import { EventBus } from '../ecs/EventBus';
import { Transform } from '../components/Transform';
import { Renderable } from '../components/Renderable';

/**
 * TransformSystem
 * Synchronizes Transform component data to Three.js mesh transforms
 */
export class TransformSystem extends System {
  constructor(eventBus: EventBus) {
    super('TransformSystem', eventBus);
    this.setRequiredComponents('Transform', 'Renderable');
    this.setPriority(0); // Run first
  }

  update(_deltaTime: number): void {
    for (const entity of this.entities.values()) {
      const transform = entity.getComponent<Transform>('Transform');
      const renderable = entity.getComponent<Renderable>('Renderable');

      if (transform && renderable && transform.dirty) {
        transform.applyTo(renderable.mesh);
      }
    }
  }
}
