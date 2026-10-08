import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { destinationPoint } from './domain/geo'
import { database } from './services/repository'

vi.mock('./services/auth', () => ({
  isSupabaseConfigured: false,
  supabase: null,
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
}))

const openSetup = async () => {
  const rendered = render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: /Race 4.*Prepare race/ }))
  fireEvent.click(await screen.findByRole('button', { name: 'Race details & preparation' }))
  return rendered
}
const enterFromCourse = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Done editing course' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Enter race mode' }))
  fireEvent.click(screen.getByRole('button', { name: 'Navigate to this target' }))
  await screen.findByText('PRE-START')
}

const confirmCourseAndEnterPrestart = async () => {
  fireEvent.click(screen.getByRole('button', { name: /Confirm course/i }))
  expect(await screen.findByRole('heading', { name: 'Race marks' })).toBeInTheDocument()
  await enterFromCourse()
}

describe('primary local race journey', () => {
  beforeEach(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 10))
    await database.delete()
    await database.open()
    localStorage.clear()
    localStorage.setItem('pin-end-local-auth', 'true')
  })

  it('confirms the course through the second-tab race marks workspace', async () => {
    await openSetup()

    expect(await screen.findByRole('heading', { name: 'Make shore time count.' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Course' })).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Primary navigation' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'More options' }))
    const navigation = screen.getByRole('navigation', { name: 'Primary navigation' })
    expect(within(navigation).getAllByRole('button').map((button) => button.textContent?.trim())).toEqual(['Races', 'Boat', 'Debug'])
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'More options' })).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(screen.getByRole('button', { name: /Confirm course/i }))
    expect(await screen.findByRole('heading', { name: 'Race marks' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Course' })).toHaveAttribute('aria-selected', 'true')
    const course = screen.getByRole('region', { name: 'Course mark list' })
    expect(within(course).getAllByRole('article')[0]).toHaveTextContent('Start line')
    expect(within(course).getAllByRole('article').at(-1)).toHaveTextContent('Finish line')
    expect(within(course).queryByRole('button', { name: 'Remove Start line' })).not.toBeInTheDocument()
    expect(within(course).queryByRole('button', { name: 'Drag Start line to reorder' })).not.toBeInTheDocument()
    expect(within(course).queryByRole('button', { name: 'Remove Finish line' })).not.toBeInTheDocument()
    expect(within(course).queryByRole('button', { name: 'Drag Finish line to reorder' })).not.toBeInTheDocument()
    expect(within(course).getByRole('radio', { name: 'Same as start' })).toBeChecked()
    expect(within(course).getByRole('button', { name: 'Position Finish line' })).toBeDisabled()
    fireEvent.click(within(course).getByRole('radio', { name: 'Separate' }))
    await waitFor(() => expect(within(course).getByRole('button', { name: 'Position Finish line' })).toBeEnabled())
    expect(within(course).getByText('Clark Island')).toBeInTheDocument()
    expect(within(course).getAllByText('Round to port')).toHaveLength(2)
    const builder = screen.getByRole('region', { name: 'Course builder' })
    expect(within(builder).getAllByRole('button', { name: /^Add mark between/ })).toHaveLength(4)
    expect(within(builder).getByRole('radio', { name: 'Round Clark Island to port' })).toBeChecked()
    const starboard = within(builder).getByRole('radio', { name: 'Round Clark Island to starboard' })
    fireEvent.click(starboard)
    await waitFor(() => expect(starboard).toBeChecked())
    expect(within(builder).getByRole('button', { name: 'Remove Clark Island' })).toBeInTheDocument()
    const dragHandle = within(builder).getByRole('button', { name: 'Drag Clark Island to reorder' })
    const windwardEntry = within(course).getAllByRole('article')[2].closest('.course-mark-entry')!
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => windwardEntry })
    fireEvent.pointerDown(dragHandle, { pointerId: 1, clientX: 10, clientY: 10 })
    fireEvent.pointerUp(dragHandle, { pointerId: 1, clientX: 10, clientY: 50 })
    await waitFor(() => expect(within(course).getAllByRole('article')[1]).toHaveTextContent('Windward mark'))
    const duplicateHandle = within(builder).getByRole('button', { name: 'Drag to duplicate Clark Island' })
    const sharkEntry = within(course).getAllByRole('article')[3].closest('.course-mark-entry')!
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => sharkEntry })
    fireEvent.pointerDown(duplicateHandle, { pointerId: 2, clientX: 10, clientY: 50 })
    fireEvent.pointerUp(duplicateHandle, { pointerId: 2, clientX: 10, clientY: 100 })
    await waitFor(() => expect(within(course).getAllByText('Clark Island')).toHaveLength(2))

    fireEvent.click(screen.getByRole('tab', { name: 'Marks' }))
    expect(screen.getByRole('region', { name: 'Race mark list' })).toBeInTheDocument()
  })

  it('inserts a selected or newly created mark between course waypoints with its rounding', async () => {
    await openSetup()

    expect(await screen.findByRole('heading', { name: 'Make shore time count.' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Confirm course/i }))
    const course = await screen.findByRole('region', { name: 'Course mark list' })
    fireEvent.click(within(course).getByRole('button', { name: 'Add mark between Start line and Clark Island' }))

    const dialog = screen.getByRole('dialog', { name: 'Add course mark' })
    const markSearch = within(dialog).getByRole('textbox', { name: 'Search marks' })
    fireEvent.change(markSearch, { target: { value: 'Shark' } })
    expect(within(dialog).queryByRole('button', { name: /Clark Island/ })).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Add to course' })).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add to course' }))
    expect(within(dialog).getByRole('status')).toHaveTextContent('Choose an existing mark')
    fireEvent.click(within(dialog).getByRole('button', { name: /Shark Island Fixed position/ }))
    expect(within(dialog).getByText(/Using Shark Island/)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Round new mark to starboard' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add to course' }))

    await waitFor(() => expect(within(course).getAllByRole('article')[1]).toHaveTextContent('Shark Island'))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add course mark' })).not.toBeInTheDocument())
    expect(within(course).getAllByRole('article')[1]).toHaveTextContent('Round to starboard')
    fireEvent.click(within(course).getAllByRole('button', { name: 'Show Shark Island on map' })[0])
    expect(within(course).getAllByRole('button', { name: 'Show Shark Island on map' })[0]).toHaveAttribute('aria-pressed', 'true')
    const courseMap = screen.getByRole('img', { name: 'Course map, north up' })
    await waitFor(() => expect(courseMap.querySelector('.course-map-marker--active')).toHaveTextContent('SHARK'))

    fireEvent.click(within(course).getByRole('button', { name: 'Add mark between Start line and Shark Island' }))
    const creator = screen.getByRole('dialog', { name: 'Add course mark' })
    fireEvent.change(within(creator).getByRole('textbox', { name: 'Search marks' }), { target: { value: 'Harbour buoy' } })
    expect(within(creator).getByText('No matching marks.')).toBeInTheDocument()
    fireEvent.click(within(creator).getByRole('button', { name: 'New point' }))
    expect(within(creator).getByRole('heading', { name: 'New point' })).toBeInTheDocument()
    expect(within(creator).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(within(creator).queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
    expect(within(creator).queryByRole('group', { name: 'Mark position type' })).not.toBeInTheDocument()
    const addButton = within(creator).getByRole('button', { name: 'Add to course' })
    expect(within(creator).queryByLabelText(/latitude|longitude/i)).not.toBeInTheDocument()
    const newPointMap = within(creator).getByRole('img', { name: 'Drag mark on Sydney Harbour map' })
    await waitFor(() => expect(newPointMap).toHaveTextContent('Clark Island'))
    expect(newPointMap).toHaveTextContent('Shark Island')
    expect(addButton).toBeEnabled()
    fireEvent.click(addButton)
    fireEvent.click(addButton)
    expect(within(creator).getByRole('button', { name: 'Cancel' })).toBeDisabled()
    await waitFor(() => expect(within(course).getAllByRole('article')[1]).toHaveTextContent('Harbour buoy'))
    expect(within(course).getAllByText('Harbour buoy')).toHaveLength(1)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add course mark' })).not.toBeInTheDocument())
    fireEvent.click(within(course).getByRole('button', { name: 'Add mark between Start line and Harbour buoy' }))
    const gateCreator = screen.getByRole('dialog', { name: 'Add course mark' })
    fireEvent.click(within(gateCreator).getByRole('button', { name: 'New gate' }))
    fireEvent.click(within(gateCreator).getByRole('button', { name: 'Add to course' }))
    expect(within(gateCreator).getByRole('status')).toHaveTextContent('Enter a name for your mark.')
    fireEvent.change(within(gateCreator).getByRole('textbox', { name: 'New mark name' }), { target: { value: 'Mid-course gate' } })
    expect(within(gateCreator).queryByRole('status')).not.toBeInTheDocument()
    expect(within(gateCreator).getByRole('img', { name: 'Drag gate pins on Sydney Harbour map' })).toBeInTheDocument()
    expect(within(gateCreator).queryByLabelText(/latitude|longitude/i)).not.toBeInTheDocument()
    expect(within(gateCreator).queryByRole('radiogroup', { name: 'New mark rounding' })).not.toBeInTheDocument()
    fireEvent.click(within(gateCreator).getByRole('button', { name: 'Add to course' }))
    await waitFor(() => expect(within(course).getAllByRole('article')[1]).toHaveTextContent('Mid-course gate'))
    const savedGate = (await database.marks.toArray()).find((mark) => mark.name === 'Mid-course gate')!
    expect(savedGate.position).toMatchObject({ kind: 'gate', pointA: { latitude: -33.86, longitude: 151.24 }, pointB: { latitude: -33.86, longitude: 151.241 } })
  })

  it('maintains the crew list and assigns race positions during setup', async () => {
    await openSetup()

    expect(await screen.findByRole('heading', { name: 'Make shore time count.' })).toBeInTheDocument()
    const crew = screen.getByRole('region', { name: 'Crew' })
    fireEvent.change(within(crew).getByRole('combobox', { name: 'Crew member' }), { target: { value: 'Alex Morgan' } })
    fireEvent.click(within(crew).getByRole('button', { name: 'Add crew member' }))

    expect(await within(crew).findByText('Alex Morgan')).toBeInTheDocument()
    await waitFor(() => expect(within(crew).getByRole('checkbox', { name: 'Alex Morgan racing' })).toBeChecked())
    const position = within(crew).getByRole('combobox', { name: 'Position for Alex Morgan' })
    fireEvent.change(position, { target: { value: 'Tactician' } })
    await waitFor(() => expect(position).toHaveValue('Tactician'))
  })

  it('creates a boat-scoped race from the home screen', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'New race' }))
    const form = screen.getByRole('dialog', { name: 'New race' })
    fireEvent.change(within(form).getByLabelText('Race name'), { target: { value: 'Race 1' } })
    fireEvent.change(within(form).getByLabelText('Scheduled start'), { target: { value: '2030-10-12T13:00' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Create race' }))
    expect(await screen.findByRole('heading', { name: 'Race marks' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Course mark list' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Position Start line' })).toBeInTheDocument()
    const savedRace = (await database.races.toArray()).find((item) => item.name === 'Race 1')!
    expect(savedRace.boatId).toBe('boat-1')
    expect(savedRace.course[0]).toMatchObject({ role: 'start' })
    expect(savedRace.course.at(-1)).toMatchObject({ role: 'finish' })
    expect(savedRace.course[0].markId).not.toBe('start-line')
    const savedFinish = await database.marks.get(savedRace.course.at(-1)!.markId)
    expect(savedFinish?.position).toMatchObject({ kind: 'gate', linkedToMarkId: savedRace.course[0].markId })
  })

  it('edits race marks on a full-page map and sights movable marks with a split preview', async () => {
    await openSetup()

    expect(await screen.findByRole('heading', { name: 'Make shore time count.' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Confirm course/i }))
    const course = await screen.findByRole('region', { name: 'Course mark list' })

    expect(within(course).queryByRole('button', { name: 'Sight Clark Island' })).not.toBeInTheDocument()
    expect(within(course).getByRole('button', { name: 'Sight Windward mark' })).toBeInTheDocument()

    fireEvent.click(within(course).getByRole('button', { name: 'Position Clark Island' }))
    const mapEditor = screen.getByRole('dialog', { name: 'Position Clark Island' })
    expect(mapEditor).toHaveClass('mark-map-editor')
    expect(within(mapEditor).getByRole('img', { name: 'Drag mark on Sydney Harbour map' })).toBeInTheDocument()
    expect(within(mapEditor).getByRole('button', { name: 'Save position' })).toBeInTheDocument()
    const undo = within(mapEditor).getByRole('button', { name: 'Undo position change' })
    expect(undo).toBeDisabled()
    const map = within(mapEditor).getByRole('img', { name: 'Drag mark on Sydney Harbour map' })
    await waitFor(() => expect(map.querySelector('.point-map-pin--first')).toBeInTheDocument())
    fireEvent(map.querySelector('.point-map-pin--first')!, new CustomEvent('dragend', { bubbles: true, detail: { lng: 151.25, lat: -33.87 } }))
    expect(undo).toBeEnabled()
    fireEvent.click(undo)
    expect(undo).toBeDisabled()
    fireEvent.click(within(mapEditor).getByRole('button', { name: 'Cancel positioning' }))

    fireEvent.click(within(course).getByRole('button', { name: 'Position Start line' }))
    const gateEditor = screen.getByRole('dialog', { name: 'Position Start line' })
    const gateMap = within(gateEditor).getByRole('img', { name: 'Drag gate pins on Sydney Harbour map' })
    await waitFor(() => expect(gateMap.querySelectorAll('.point-map-pin')).toHaveLength(5))
    expect(gateMap.querySelectorAll('.point-map-pin--first, .point-map-pin--second')).toHaveLength(2)
    expect(within(gateEditor).queryByRole('tab')).not.toBeInTheDocument()
    fireEvent.click(within(gateEditor).getByRole('button', { name: 'Close position editor' }))

    fireEvent.click(within(course).getByRole('button', { name: 'Sight Start line' }))
    const startSighting = await screen.findByRole('dialog', { name: 'Sight the Pin' })
    expect(within(startSighting).getByRole('button', { name: 'Pin' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(startSighting).getByRole('button', { name: 'Boat' }))
    expect(await screen.findByRole('dialog', { name: 'Sight the Boat' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close camera' }))

    fireEvent.click(within(course).getByRole('button', { name: 'Sight Windward mark' }))
    const sighting = await screen.findByRole('dialog', { name: 'Sight the Windward mark' })
    expect(within(sighting).getByRole('region', { name: 'Camera preview' })).toBeInTheDocument()
    expect(within(sighting).getByRole('region', { name: 'Sighting map' })).toBeInTheDocument()
    expect(within(sighting).queryByText('True bearing')).not.toBeInTheDocument()
    expect(within(sighting).getByRole('button', { name: 'Capture Windward mark sighting' })).toBeEnabled()
    fireEvent.click(within(sighting).getByRole('button', { name: 'Close camera' }))
    expect(screen.queryByRole('dialog', { name: 'Sight the Windward mark' })).not.toBeInTheDocument()
  })

  it('moves from setup through pre-start into race mode', async () => {
    await openSetup()

    expect(await screen.findByRole('heading', { name: 'Make shore time count.' })).toBeInTheDocument()
    await confirmCourseAndEnterPrestart()

    expect(await screen.findByText('PRE-START')).toBeInTheDocument()
    const prestartInstruments = screen.getByRole('main', { name: 'Pre-start instruments' })
    expect(prestartInstruments).toHaveClass('race-main')
    expect(within(prestartInstruments).getByText('Estimated line crossing')).toBeInTheDocument()
    expect(within(prestartInstruments).getByText('GPS boat speed')).toBeInTheDocument()
    expect(within(prestartInstruments).queryByText('Accuracy')).not.toBeInTheDocument()
    expect(within(prestartInstruments).queryByText('START SEQUENCE')).not.toBeInTheDocument()
    expect(within(prestartInstruments).queryByText('Start line resolved')).not.toBeInTheDocument()
    expect(within(prestartInstruments).getByRole('img', { name: /Course map/ })).toBeInTheDocument()
    expect(within(prestartInstruments).getByRole('button', { name: /5:00 Warning/i })).toBeInTheDocument()
    expect(within(prestartInstruments).getByRole('button', { name: /4:00 Preparatory/i })).toBeInTheDocument()
    expect(within(prestartInstruments).getByRole('button', { name: /1:00 One minute/i })).toBeInTheDocument()
    expect(within(prestartInstruments).getByText('Keep a proper lookout')).toBeInTheDocument()
    expect(document.querySelector('.app-shell')).toHaveClass('app-shell--racing')
    expect(within(prestartInstruments).queryByRole('button', { name: 'Next mark' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Start now/i }))

    await waitFor(() => expect(screen.getByText('RACING')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Mark rounded/i })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Primary navigation' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Next mark' }))
    expect(await screen.findByRole('heading', { name: 'Windward mark' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Previous mark' }))
    expect(await screen.findByRole('heading', { name: 'Clark Island' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Previous mark' }))
    expect(screen.getByText('RACING')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Start line' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Previous mark' }))
    expect(screen.getByRole('button', { name: 'Previous mark' })).toBeDisabled()
    expect(screen.queryByRole('dialog', { name: 'Return to pre-start?' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    fireEvent.click(await screen.findByRole('button', { name: /Race 4.*Resume race/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Resume race' }))
    expect(await screen.findByText('RACING')).toBeInTheDocument()
  })

  it('enters race mode automatically when the synchronized start arrives', async () => {
    await openSetup()

    expect(await screen.findByRole('heading', { name: 'Make shore time count.' })).toBeInTheDocument()
    await confirmCourseAndEnterPrestart()
    expect(await screen.findByText('PRE-START')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /START Gun/i }))

    expect(await screen.findByText('RACING')).toBeInTheDocument()
  })

  it('preserves rounding history when changing targets and finishes into replay', async () => {
    await openSetup()

    expect(await screen.findByRole('heading', { name: 'Make shore time count.' })).toBeInTheDocument()
    await confirmCourseAndEnterPrestart()
    expect(await screen.findByText('PRE-START')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /START Gun/i }))
    expect(await screen.findByText('RACING')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Mark rounded/i }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Confirm mark rounding' })).getByRole('button', { name: /Confirm & advance/i }))
    expect(await screen.findByRole('heading', { name: 'Windward mark' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Previous mark' }))
    fireEvent.click(screen.getByRole('button', { name: 'Previous mark' }))
    expect(screen.getByText('RACING')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Start line' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Previous mark' }))
    expect(screen.getByRole('button', { name: 'Previous mark' })).toBeDisabled()
    const saved = (await database.sessions.toArray())[0]
    expect(saved.roundedAt['leg-1']).toBeDefined()
    for (let i = 0; i < 4; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Next mark' }))
      await waitFor(() => expect(document.querySelector('.race-focus__topline')).toHaveTextContent(`LEG ${i + 2} OF`))
    }
    expect(await screen.findByRole('heading', { name: 'Finish line' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Finish race' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Confirm mark rounding' })).getByRole('button', { name: /Confirm & advance/i }))

    expect(await screen.findByRole('heading', { name: 'Finished.' })).toBeInTheDocument()
    const statistics = screen.getByRole('region', { name: 'Race statistics' })
    expect(within(statistics).getByText('Total distance sailed')).toBeInTheDocument()
    expect(within(statistics).getByText('Average GPS speed')).toBeInTheDocument()
    expect(within(statistics).getByText('Total duration')).toBeInTheDocument()
    expect(within(statistics).getByText('Corrected time')).toBeInTheDocument()
    expect(screen.getByText('No handicap')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Actual sailed route and replay' })).toBeInTheDocument()
  })

  it('keeps start-line positioning and sighting on the deduplicated Marks view', async () => {
    await openSetup()

    expect(await screen.findByRole('heading', { name: 'Make shore time count.' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Confirm course/i }))
    fireEvent.click(await screen.findByRole('tab', { name: 'Marks' }))
    const markList = screen.getByRole('region', { name: 'Race mark list' })
    expect(within(markList).getByRole('button', { name: 'Position Start line' })).toBeInTheDocument()
    expect(within(markList).getByRole('button', { name: 'Sight Start line' })).toBeInTheDocument()

    fireEvent.click(within(markList).getByRole('button', { name: 'Sight Start line' }))
    const sighting = await screen.findByRole('dialog', { name: 'Sight the Pin' })
    expect(within(sighting).getByRole('region', { name: 'Camera preview' })).toBeInTheDocument()
    expect(within(sighting).getByRole('region', { name: 'Sighting map' })).toBeInTheDocument()
    expect(within(sighting).getByRole('button', { name: 'Boat' })).toBeInTheDocument()
  })

  it('shows distance to a nearby race mark in metres', async () => {
    await openSetup()

    expect(await screen.findByRole('heading', { name: 'Make shore time count.' })).toBeInTheDocument()
    await confirmCourseAndEnterPrestart()
    fireEvent.click(screen.getByRole('button', { name: /START Gun/i }))
    expect(await screen.findByText('RACING')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    fireEvent.click(screen.getByRole('button', { name: 'More options' }))
    fireEvent.click(screen.getByRole('button', { name: 'Debug' }))
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Use simulated sensors' }))
    fireEvent.click(screen.getByRole('button', { name: /^Near / }))
    fireEvent.click(screen.getByRole('button', { name: 'More options' }))
    fireEvent.click(screen.getByRole('button', { name: 'Races' }))
    fireEvent.click(await screen.findByRole('button', { name: /Race 4.*Resume race/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Resume race' }))

    await waitFor(() => expect(screen.getByText('M TO MARK').closest('.race-distance')).toHaveTextContent(/^\d+ M TO MARK$/))
  })

  it('uses distinct port and starboard rounding arrows in race mode', async () => {
    await openSetup()

    expect(await screen.findByRole('heading', { name: 'Make shore time count.' })).toBeInTheDocument()
    await confirmCourseAndEnterPrestart()
    fireEvent.click(screen.getByRole('button', { name: /START Gun/i }))
    expect(await screen.findByText('RACING')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Port rounding' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Next mark' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next mark' }))
    expect(await screen.findByRole('heading', { name: 'Shark Island' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Starboard rounding' })).toBeInTheDocument()
  })

  it('lets a developer mock boat position and velocity', async () => {
    await openSetup()

    expect(await screen.findByRole('heading', { name: 'Make shore time count.' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'More options' }))
    fireEvent.click(screen.getByRole('button', { name: 'Debug' }))
    expect(await screen.findByRole('heading', { name: 'Drive the simulated boat.' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Drag the boat and its speed handle on the simulator map' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Drag boat position' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Drag to set heading and speed' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Use simulated sensors' }))
    fireEvent.click(screen.getByRole('button', { name: 'More options' }))
    fireEvent.click(screen.getByRole('button', { name: 'Races' }))
    fireEvent.click(await screen.findByRole('button', { name: /Race 4.*Prepare race/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Race details & preparation' }))
    fireEvent.click(screen.getByRole('button', { name: /Confirm course/i }))
    expect(await screen.findByText('Current location')).toBeInTheDocument()
  })

  it('responds to simulator changes made in another window', async () => {
    await openSetup()

    expect(await screen.findByRole('heading', { name: 'Make shore time count.' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'More options' }))
    fireEvent.click(screen.getByRole('button', { name: 'Debug' }))
    const remoteSimulator = {
      coordinate: { latitude: -33.91, longitude: 151.21 },
      heading: 180,
      speedKnots: 9.3,
      accuracy: 3,
      reading: {
        latitude: -33.91,
        longitude: 151.21,
        timestamp: 1234,
        accuracy: 3,
        heading: 180,
        speedKnots: 9.3,
        source: 'simulator',
        headingSource: 'simulator',
        headingReliable: true,
        deviceHeading: 180,
        courseOverGround: 180,
      },
    }

    localStorage.setItem('pin-end-dev-simulator', JSON.stringify({ enabled: true, simulator: remoteSimulator }))
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem')
    fireEvent(window, new StorageEvent('storage', {
      key: 'pin-end-dev-simulator',
      newValue: JSON.stringify({ enabled: true, simulator: remoteSimulator }),
    }))

    expect(screen.getByRole('checkbox', { name: 'Use simulated sensors' })).toBeChecked()
    expect(screen.getByText(/9\.3 kn/)).toBeInTheDocument()
    expect(storageSpy.mock.calls.filter(([key]) => key === 'pin-end-dev-simulator')).toHaveLength(0)

    const newerSimulator = { ...remoteSimulator, speedKnots: 13, reading: { ...remoteSimulator.reading, speedKnots: 13 } }
    localStorage.setItem('pin-end-dev-simulator', JSON.stringify({ enabled: true, simulator: newerSimulator }))
    fireEvent.click(screen.getByRole('button', { name: 'Move 30 sec' }))
    const movedSimulator = JSON.parse(localStorage.getItem('pin-end-dev-simulator') ?? '{}').simulator
    const expectedPosition = destinationPoint(newerSimulator.coordinate, 13 * 30 / 3600, newerSimulator.heading)
    expect(movedSimulator.speedKnots).toBe(13)
    expect(movedSimulator.coordinate.latitude).toBeCloseTo(expectedPosition.latitude, 7)
    expect(movedSimulator.coordinate.longitude).toBeCloseTo(expectedPosition.longitude, 7)
    storageSpy.mockRestore()
  })

  it('rejects malformed simulator state from shared browser storage', async () => {
    localStorage.setItem('pin-end-dev-simulator', JSON.stringify({ enabled: true, simulator: { reading: {} } }))
    await openSetup()

    expect(await screen.findByRole('heading', { name: 'Make shore time count.' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'More options' }))
    fireEvent.click(screen.getByRole('button', { name: 'Debug' }))
    expect(screen.getByRole('checkbox', { name: 'Use simulated sensors' })).not.toBeChecked()
    expect(screen.getByText(/6\.2 kn/)).toBeInTheDocument()
  })

  it('persists local simulator controls for a separate window', async () => {
    const firstWindow = await openSetup()

    expect(await screen.findByRole('heading', { name: 'Make shore time count.' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'More options' }))
    fireEvent.click(screen.getByRole('button', { name: 'Debug' }))
    fireEvent.change(screen.getByRole('slider', { name: 'GPS accuracy' }), { target: { value: '11' } })
    expect(JSON.parse(localStorage.getItem('pin-end-dev-simulator') ?? '{}').simulator.accuracy).toBe(11)

    firstWindow.unmount()
    await openSetup()
    expect(await screen.findByRole('heading', { name: 'Make shore time count.' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'More options' }))
    fireEvent.click(screen.getByRole('button', { name: 'Debug' }))
    expect(screen.getByText('±11 m')).toBeInTheDocument()
  })
})
