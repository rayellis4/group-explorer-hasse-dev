/*
 * ToDo:  disable when chunking
 */
class DiagramDnD {
   constructor(displayDiagram) {
      this.displayDiagram = displayDiagram;
      this.canvas = displayDiagram.renderer.domElement;
      this.mouse = new THREE.Vector2();
      this.raycaster = new THREE.Raycaster();
      this.raycaster.linePrecision = 0.01;
      this.event_handler = (event) => this.eventHandler(event);
      this.repaint_poller = undefined;
      this.repaint_request = undefined;
      this.object = undefined;

      $(displayDiagram.renderer.domElement).on('mousedown', this.event_handler);
   }

   eventHandler(event) {
      if (!event.shiftKey) {
         return;
      }

      event.preventDefault();
      event.stopPropagation();

      const bounding_box = this.canvas.getBoundingClientRect();
      this.mouse.x = ( (event.clientX - bounding_box.x) / this.canvas.width) * 2 - 1;
      this.mouse.y = -( (event.clientY - bounding_box.y) / this.canvas.height) * 2 + 1;

      switch (event.type) {
         case 'mousedown':  this.dragStart(event);  break;
         case 'mousemove':  this.dragOver(event);   break;
         case 'mouseup':    this.drop(event);       break;
      }
   }

   // start drag-and-drop; see if we've found a line
   dragStart(event) {
      // update the picking ray with the camera and mouse position
      this.raycaster.setFromCamera(this.mouse, this.displayDiagram.camera);

      // temporarily change the width of the lines to 1 for raycasting -- doesn't seem to work with meshLines (sigh)
      // (this change is never rendered, so user never sees it)
      const saved_width = this.displayDiagram.scene.userData.lineWidth;
      this.displayDiagram.scene.userData.lineWidth = 1;
      this.displayDiagram.updateLines(this.displayDiagram.scene.userData);

      // calculate objects intersecting the picking ray
      const intersects = this.raycaster.intersectObjects(
         this.displayDiagram.getGroup("lines").children.concat(this.displayDiagram.getGroup("spheres").children), false);

      // now change the line width back
      this.displayDiagram.scene.userData.lineWidth = saved_width;
      this.displayDiagram.updateLines(this.displayDiagram.scene.userData);

      // if empty intersect just return
      if (intersects.length == 0) {
         return;
      }

      // found an object (line or sphere); squirrel it away and wait for further dnd events
      this.object = intersects[0].object;
      $(this.canvas).off('mousemove', this.event_handler).on('mousemove', this.event_handler);
      $(this.canvas).off('mouseup', this.event_handler).on('mouseup', this.event_handler);

      // change cursor to grab
      this.canvas.style.cursor = 'move';

      this.repaint_poller = window.setInterval(() => this.repaintPoller(), 100);
   }

   dragOver(event) {
      this.repaint_request = (this.repaint_request === undefined) ? performance.now() : this.repaint_request;
   }

   drop(event) {
      this.repaint();
      this.endDrag(event);
   }

   endDrag(event) {
      $(this.canvas).off('mousemove', this.event_handler);
      $(this.canvas).off('mouseup', this.event_handler);
      this.canvas.style.cursor = '';
      window.clearInterval(this.repaint_poller);
      this.repaint_poller = undefined;
      this.object = undefined;
   }

   repaintPoller() {
      if (performance.now() - this.repaint_request > 100) {
         this.repaint();
      }
   }

   // update line to run through current mouse position
   repaint() {
      // get ray through mouse
      this.raycaster.setFromCamera(this.mouse, this.displayDiagram.camera);

      if (this.object.type == 'Line') {
         this.repaintLine();
      } else if (this.object.type == 'Mesh') {
         this.repaintSphere();
      }

      // clear repaint request
      this.repaint_request = undefined;
   }

   repaintLine() {
      // get intersection of ray with plane of line (through start, end, center)
      const start = this.object.userData.line.vertices[0].point;
      const end = this.object.userData.line.vertices[1].point;
      const center = this.displayDiagram._getCenter(this.object.userData.line);
      const center2start = start.clone().sub(center);
      const center2end = end.clone().sub(center);

      // find 'intersection', the point the raycaster ray intersects the plane defined by start, end and center
      const m = new THREE.Matrix3().set(...center2start.toArray(),
                                        ...center2end.toArray(),
                                        ...this.raycaster.ray.direction.toArray())
                         .transpose();
      const s = this.raycaster.ray.origin.clone().applyMatrix3(new THREE.Matrix3().getInverse(m));
      const intersection = this.raycaster.ray.origin.clone().add(this.raycaster.ray.direction.clone().multiplyScalar(-s.z));

      // get offset length
      const start2intxn = intersection.clone().sub(start);
      const start2end = end.clone().sub(start);
      const plane_normal = new THREE.Vector3().crossVectors(center2start, center2end).normalize();
      const line_length = start2end.length();
      const offset = new THREE.Vector3().crossVectors(start2intxn, start2end).dot(plane_normal)/(line_length * line_length);

      // set line offset in diagram, and re-paint lines, arrowheads
      this.object.userData.line.style = Diagram3D.CURVED;
      this.object.userData.line.offset = offset;
      this.displayDiagram.updateLines(this.displayDiagram.scene.userData);
      this.displayDiagram.updateArrowheads(this.displayDiagram.scene.userData);
   }

   repaintSphere() {
      // change node location to 3D intersection between ray and plane normal to camera POV containing node
      const node = this.object.userData.node.point;
      const ray_origin = this.raycaster.ray.origin;
      const ray_direction = this.raycaster.ray.direction;
      const projection = ray_origin.clone().multiplyScalar(ray_origin.dot(node)/node.length()/ray_origin.length()/ray_origin.length());
      const inplane = node.clone().sub(projection);
      const normal = new THREE.Vector3().crossVectors(inplane, ray_origin).normalize();

      const m = new THREE.Matrix3().set(...inplane.toArray(),
                                        ...normal.toArray(),
                                        ...ray_direction.toArray() )
                         .transpose();
      const s = ray_origin.clone().sub(projection).applyMatrix3(new THREE.Matrix3().getInverse(m));
      const new_node = ray_origin.clone().add(ray_direction.clone().multiplyScalar(-s.z));

      this.object.userData.node.point = new_node;

      this.displayDiagram.updateNodes(this.displayDiagram.scene.userData);
      this.displayDiagram.updateHighlights(this.displayDiagram.scene.userData);
      this.displayDiagram.updateLabels(this.displayDiagram.scene.userData);
      this.displayDiagram.updateLines(this.displayDiagram.scene.userData);
      this.displayDiagram.updateArrowheads(this.displayDiagram.scene.userData);
      this.displayDiagram.render();
   }
}