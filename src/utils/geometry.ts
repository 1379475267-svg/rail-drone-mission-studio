import type { DroneWaypoint, NoFlyZone, Point2D } from '@/types/scene'

const EPSILON = 1e-9

export interface RouteSegment {
  start: Point2D
  end: Point2D
  startWaypointId?: string
  endWaypointId?: string
}

export function isFinitePoint(value: Point2D): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y)
}

export function distanceBetween(start: Point2D, end: Point2D): number {
  return Math.hypot(end.x - start.x, end.y - start.y)
}

export function pixelsToMeters(pixelDistance: number, pixelsPerMeter: number): number {
  if (!Number.isFinite(pixelsPerMeter) || pixelsPerMeter <= 0) {
    return 0
  }

  return Math.max(0, pixelDistance) / pixelsPerMeter
}

export function distanceInMeters(
  start: Point2D,
  end: Point2D,
  pixelsPerMeter: number,
): number {
  return pixelsToMeters(distanceBetween(start, end), pixelsPerMeter)
}

export function polylineLength(points: readonly Point2D[]): number {
  let length = 0
  for (let index = 1; index < points.length; index += 1) {
    length += distanceBetween(points[index - 1], points[index])
  }
  return length
}

export function waypointRouteDistance(
  waypoints: readonly DroneWaypoint[],
  pixelsPerMeter: number,
): number {
  return pixelsToMeters(
    polylineLength(waypoints.map((waypoint) => waypoint.position)),
    pixelsPerMeter,
  )
}

export function waypointRouteSegments(waypoints: readonly DroneWaypoint[]): RouteSegment[] {
  const segments: RouteSegment[] = []
  for (let index = 1; index < waypoints.length; index += 1) {
    const startWaypoint = waypoints[index - 1]
    const endWaypoint = waypoints[index]
    segments.push({
      start: startWaypoint.position,
      end: endWaypoint.position,
      startWaypointId: startWaypoint.id,
      endWaypointId: endWaypoint.id,
    })
  }
  return segments
}

function orientation(first: Point2D, second: Point2D, third: Point2D): number {
  return (second.y - first.y) * (third.x - second.x)
    - (second.x - first.x) * (third.y - second.y)
}

function isPointOnSegment(point: Point2D, start: Point2D, end: Point2D): boolean {
  return point.x <= Math.max(start.x, end.x) + EPSILON
    && point.x + EPSILON >= Math.min(start.x, end.x)
    && point.y <= Math.max(start.y, end.y) + EPSILON
    && point.y + EPSILON >= Math.min(start.y, end.y)
}

export function segmentsIntersect(
  firstStart: Point2D,
  firstEnd: Point2D,
  secondStart: Point2D,
  secondEnd: Point2D,
): boolean {
  const firstOrientation = orientation(firstStart, firstEnd, secondStart)
  const secondOrientation = orientation(firstStart, firstEnd, secondEnd)
  const thirdOrientation = orientation(secondStart, secondEnd, firstStart)
  const fourthOrientation = orientation(secondStart, secondEnd, firstEnd)

  if (
    Math.sign(firstOrientation) !== Math.sign(secondOrientation)
    && Math.sign(thirdOrientation) !== Math.sign(fourthOrientation)
  ) {
    return true
  }

  return (Math.abs(firstOrientation) <= EPSILON && isPointOnSegment(secondStart, firstStart, firstEnd))
    || (Math.abs(secondOrientation) <= EPSILON && isPointOnSegment(secondEnd, firstStart, firstEnd))
    || (Math.abs(thirdOrientation) <= EPSILON && isPointOnSegment(firstStart, secondStart, secondEnd))
    || (Math.abs(fourthOrientation) <= EPSILON && isPointOnSegment(firstEnd, secondStart, secondEnd))
}

export function isPointInsideNoFlyZone(point: Point2D, zone: NoFlyZone): boolean {
  const minimumX = Math.min(zone.position.x, zone.position.x + zone.width)
  const maximumX = Math.max(zone.position.x, zone.position.x + zone.width)
  const minimumY = Math.min(zone.position.y, zone.position.y + zone.height)
  const maximumY = Math.max(zone.position.y, zone.position.y + zone.height)

  return point.x >= minimumX && point.x <= maximumX
    && point.y >= minimumY && point.y <= maximumY
}

export function segmentIntersectsNoFlyZone(
  start: Point2D,
  end: Point2D,
  zone: NoFlyZone,
): boolean {
  if (isPointInsideNoFlyZone(start, zone) || isPointInsideNoFlyZone(end, zone)) {
    return true
  }

  const topLeft = zone.position
  const topRight = { x: zone.position.x + zone.width, y: zone.position.y }
  const bottomRight = {
    x: zone.position.x + zone.width,
    y: zone.position.y + zone.height,
  }
  const bottomLeft = { x: zone.position.x, y: zone.position.y + zone.height }

  return segmentsIntersect(start, end, topLeft, topRight)
    || segmentsIntersect(start, end, topRight, bottomRight)
    || segmentsIntersect(start, end, bottomRight, bottomLeft)
    || segmentsIntersect(start, end, bottomLeft, topLeft)
}
