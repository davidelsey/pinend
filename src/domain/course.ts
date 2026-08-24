import type { CourseWaypoint } from './types'

export const isStartWaypoint = (waypoint: CourseWaypoint) => waypoint.role === 'start' || waypoint.markId === 'start-line'
export const isFinishWaypoint = (waypoint: CourseWaypoint) => waypoint.role === 'finish' || waypoint.markId === 'finish-line'
