import * as THREE from "three";

export function arcballVector(clientX, clientY, rect) {
  const size = Math.max(1, Math.min(rect.width, rect.height));
  const x = ((clientX - rect.left) - rect.width / 2) / (size / 2);
  const y = (rect.height / 2 - (clientY - rect.top)) / (size / 2);
  const lengthSquared = x * x + y * y;

  if (lengthSquared <= 1) return new THREE.Vector3(x, y, Math.sqrt(1 - lengthSquared));
  return new THREE.Vector3(x, y, 0).normalize();
}

export function cameraRelativeDrag(start, current, cameraQuaternion) {
  const cameraDrag = new THREE.Quaternion().setFromUnitVectors(start, current);
  const inverseCamera = cameraQuaternion.clone().invert();
  return cameraQuaternion.clone().multiply(cameraDrag).multiply(inverseCamera).normalize();
}
