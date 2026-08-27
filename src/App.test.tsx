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

const confirmCourseAndEnterPrestart = async () => {
  fireEvent.click(screen.getByRole('button', { name: /Confirm course/i }))
  expect(await screen.findByRole('heading', { name: 'Race marks' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Enter pre-start/i }))
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
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Make shore time count.' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Course' })).not.toBeInTheDocument()
    const navigation = screen.getByRole('navigation', { name: 'Primary navigation' })
    expect(within(navigation).getAllByRole('button').map((button) => button.textContent)).toEqual(['Setup', 'Marks', 'Race', 'Boat', 'Debug'])

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
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Make shore time count.' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Confirm course/i }))
    const course = await screen.findByRole('region', { name: 'Course mark list' })
    fireEvent.click(within(course).getByRole('button', { name: 'Add mark between Start line and Clark Island' }))

    const dialog = screen.getByRole('dialog', { name: 'Add course mark' })
    const markCombo = within(dialog).getByRole('combobox', { name: 'Select or create a mark' })
    fireEvent.change(markCombo, { target: { value: 'Shark Island' } })
    expect(within(dialog).getByText(/Using Shark Island/)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Round new mark to starboard' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add to course' }))

    await waitFor(() => expect(within(course).getAllByRole('article')[1]).toHaveTextContent('Shark Island'))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add course mark' })).not.toBeInTheDocument())
    expect(within(course).getAllByRole('article')[1]).toHaveTextContent('Round to starboard')

    fireEvent.click(within(course).getByRole('button', { name: 'Add mark between Start line and Shark Island' }))
    const creator = screen.getByRole('dialog', { name: 'Add course mark' })
    fireEvent.change(within(creator).getByRole('combobox', { name: 'Select or create a mark' }), { target: { value: 'Harbour buoy' } })
    expect(within(creator).getByRole('group', { name: 'Mark position type' })).toBeInTheDocument()
    const addButton = within(creator).getByRole('button', { name: 'Add to course' })
    fireEvent.click(within(creator).getByRole('button', { name: 'constructed' }))
    fireEvent.click(within(creator).getByRole('button', { name: 'Magnetic' }))
    fireEvent.change(within(creator).getByLabelText('Magnetic declination (east positive)'), { target: { value: '181' } })
    expect(addButton).toBeDisabled()
    fireEvent.click(within(creator).getByRole('button', { name: 'fixed' }))
    fireEvent.change(within(creator).getByLabelText('Latitude'), { target: { value: '91' } })
    expect(addButton).toBeDisabled()
    expect(within(creator).getByRole('alert')).toHaveTextContent('Enter a valid position')
    fireEvent.change(within(creator).getByLabelText('Latitude'), { target: { value: '-33.86' } })
    expect(addButton).toBeEnabled()
    fireEvent.click(addButton)
    fireEvent.click(addButton)
    expect(within(creator).getByRole('button', { name: 'Cancel' })).toBeDisabled()
    await waitFor(() => expect(within(course).getAllByRole('article')[1]).toHaveTextContent('Harbour buoy'))
    expect(within(course).getAllByText('Harbour buoy')).toHaveLength(1)
  })

  it('maintains the crew list and assigns race positions during setup', async () => {
    render(<App />)

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

  it('lists saved races and creates a new offline race', async () => {
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Make shore time count.' })).toBeInTheDocument()
    const races = screen.getByRole('list', { name: 'Races' })
    expect(within(races).getByText('Race 4')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'New race' }))
    const form = screen.getByRole('group', { name: 'New race details' })
    expect(form.closest('.panel')).not.toContainElement(screen.getByRole('list', { name: 'Races' }))
    expect(within(form).getByText('CYCA')).toBeInTheDocument()
    expect(within(form).getByText('Cruising Yacht Club of Australia')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Current race' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm course' })).not.toBeInTheDocument()
    const defaultStart = new Date((within(form).getByLabelText('Scheduled start') as HTMLInputElement).value).getTime()
    expect(defaultStart - Date.now()).toBeGreaterThan(55 * 60_000)
    expect(defaultStart - Date.now()).toBeLessThan(65 * 60_000)
    expect(within(form).getByRole('combobox', { name: 'Series' })).toHaveAttribute('list', 'setup-series-options')
    expect(within(form).getByRole('combobox', { name: 'Fleet' })).toHaveAttribute('list', 'setup-fleet-options')
    expect(document.querySelector('#setup-series-options option[value="Spring Series"]')).toBeInTheDocument()
    expect(document.querySelector('#setup-fleet-options option[value="PHS Division 1"]')).toBeInTheDocument()
    fireEvent.change(within(form).getByLabelText('Series'), { target: { value: 'Winter Series' } })
    fireEvent.change(within(form).getByLabelText('Race name'), { target: { value: 'Race 1' } })
    fireEvent.change(within(form).getByLabelText('Fleet'), { target: { value: 'Division 2' } })
    fireEvent.change(within(form).getByLabelText('Handicap / TCF'), { target: { value: '0.932' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Create race' }))

    expect(await within(races).findByText('Race 1')).toBeInTheDocument()
    await waitFor(() => expect(within(races).getByText('Race 1').closest('button')).toHaveClass('is-selected'))
    expect(await screen.findByLabelText('Race')).toHaveValue('Race 1')
    const savedRace = (await database.races.toArray()).find((item) => item.name === 'Race 1')!
    expect(savedRace.course[0]).toMatchObject({ role: 'start' })
    expect(savedRace.handicap).toBe(0.932)
    expect(savedRace.course.at(-1)).toMatchObject({ role: 'finish' })
    expect(savedRace.course[0].markId).not.toBe('start-line')
    const savedFinish = await database.marks.get(savedRace.course.at(-1)!.markId)
    expect(savedFinish?.position).toMatchObject({ kind: 'gate', linkedToMarkId: savedRace.course[0].markId })

    fireEvent.click(screen.getByRole('button', { name: 'Confirm course' }))
    const newCourse = await screen.findByRole('region', { name: 'Course mark list' })
    fireEvent.click(within(newCourse).getByRole('button', { name: 'Position Start line' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save position' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enter pre-start' }))
    expect(await screen.findByText('PRE-START')).toBeInTheDocument()
    expect(screen.queryByText('Start line resolved')).not.toBeInTheDocument()
  })

  it('edits race marks on a full-page map and sights movable marks with a split preview', async () => {
    render(<App />)

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
    render(<App />)

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
    fireEvent.click(within(prestartInstruments).getByRole('button', { name: 'Next mark' }))
    expect(await within(prestartInstruments).findByRole('heading', { name: 'Clark Island' })).toBeInTheDocument()
    fireEvent.click(within(prestartInstruments).getByRole('button', { name: 'Previous mark' }))
    expect(await within(prestartInstruments).findByRole('heading', { name: 'Start line' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Start race mode/i }))

    await waitFor(() => expect(screen.getByText('RACING')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Mark rounded/i })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Boat' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Next mark' }))
    expect(await screen.findByRole('heading', { name: 'Windward mark' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Previous mark' }))
    expect(await screen.findByRole('heading', { name: 'Clark Island' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Previous mark' }))
    expect(screen.getByText('RACING')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Start line' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Previous mark' }))
    const warning = screen.getByRole('dialog', { name: 'Return to pre-start?' })
    expect(within(warning).getByText('This will clear all timing data for this race.')).toBeInTheDocument()
    fireEvent.click(within(warning).getByRole('button', { name: 'Stay in race' }))
    expect(screen.getByText('RACING')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Return to pre-start?' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Previous mark' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Return to pre-start?' })).getByRole('button', { name: 'Clear timing & enter pre-start' }))
    expect(await screen.findByText('PRE-START')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Start race mode/i }))
    expect(await screen.findByText('RACING')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Boat' }))
    expect(await screen.findByRole('heading', { name: 'Second Wind' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Race' }))
    expect(await screen.findByText('RACING')).toBeInTheDocument()
  })

  it('enters race mode automatically when the synchronized start arrives', async () => {
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Make shore time count.' })).toBeInTheDocument()
    await confirmCourseAndEnterPrestart()
    expect(await screen.findByText('PRE-START')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /START Gun/i }))

    expect(await screen.findByText('RACING')).toBeInTheDocument()
  })

  it('clears prior race timing when the sailor confirms a return to pre-start', async () => {
    render(<App />)

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
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Return to pre-start?' })).getByRole('button', { name: 'Clear timing & enter pre-start' }))
    expect(await screen.findByText('PRE-START')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Start line' })).toBeInTheDocument()
    await new Promise((resolve) => window.setTimeout(resolve, 400))
    expect(screen.getByText('PRE-START')).toBeInTheDocument()
    expect(screen.queryByText('RACING')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Start race mode/i }))
    expect(await screen.findByText('RACING')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next mark' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next mark' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next mark' }))
    expect(await screen.findByRole('heading', { name: 'Finish line' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Mark rounded/i }))
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
    render(<App />)

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
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Make shore time count.' })).toBeInTheDocument()
    await confirmCourseAndEnterPrestart()
    fireEvent.click(screen.getByRole('button', { name: /START Gun/i }))
    expect(await screen.findByText('RACING')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Debug' }))
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Use simulated sensors' }))
    fireEvent.click(screen.getByRole('button', { name: /^Near / }))
    fireEvent.click(screen.getByRole('button', { name: 'Race' }))

    await waitFor(() => expect(screen.getByText('M TO MARK').closest('.race-distance')).toHaveTextContent(/^\d+ M TO MARK$/))
  })

  it('uses distinct port and starboard rounding arrows in race mode', async () => {
    render(<App />)

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
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Make shore time count.' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Debug' }))
    expect(await screen.findByRole('heading', { name: 'Drive the simulated boat.' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Drag the boat and its speed handle on the simulator map' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Drag boat position' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Drag to set heading and speed' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Use simulated sensors' }))
    fireEvent.click(screen.getByRole('button', { name: 'Setup' }))
    fireEvent.click(screen.getByRole('button', { name: /Confirm course/i }))
    expect(await screen.findByText('Current location')).toBeInTheDocument()
  })

  it('responds to simulator changes made in another window', async () => {
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Make shore time count.' })).toBeInTheDocument()
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
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Make shore time count.' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Debug' }))
    expect(screen.getByRole('checkbox', { name: 'Use simulated sensors' })).not.toBeChecked()
    expect(screen.getByText(/6\.2 kn/)).toBeInTheDocument()
  })

  it('persists local simulator controls for a separate window', async () => {
    const firstWindow = render(<App />)

    expect(await screen.findByRole('heading', { name: 'Make shore time count.' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Debug' }))
    fireEvent.change(screen.getByRole('slider', { name: 'GPS accuracy' }), { target: { value: '11' } })
    expect(JSON.parse(localStorage.getItem('pin-end-dev-simulator') ?? '{}').simulator.accuracy).toBe(11)

    firstWindow.unmount()
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Make shore time count.' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Debug' }))
    expect(screen.getByText('±11 m')).toBeInTheDocument()
  })
})
