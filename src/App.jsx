
import { useEffect, useState } from 'react'
import './App.css'

const API = 'http://localhost:5000/api/applications'

function App() {
  const [applications, setApplications] = useState([])
  const [counts, setCounts] = useState({})
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('')
  const [message, setMessage] = useState('')
  const [editing, setEditing] = useState(null)
  const [showForm, setShowForm] = useState(false)

  const emptyForm = {
    companyName: '',
    jobRole: '',
    jobType: 'Full-time',
    appliedDate: new Date().toLocaleDateString('en-CA'),
    expectedSalary: '',
    notes: ''
  }

  const [form, setForm] = useState(emptyForm)

 
async function loadApplications() {
  try {
    setMessage('')

    const params = new URLSearchParams()
    if (search.trim()) params.set('company', search.trim())
    if (filter) params.set('status', filter)

    const res = await fetch(`${API}?${params}`)
    const result = await res.json()

    if (!res.ok || !result.success) {
      setMessage(result.message || 'Could not load applications')
      return
    }

    const data = result.data
    setApplications(data?.applications || [])
    setCounts(data?.statusCounts || {})
    setMessage('Applications refreshed successfully!')
  } catch {
    setMessage('Cannot connect to backend. Make sure it is running.')
  }
}


  useEffect(() => {
    loadApplications()
  }, [search, filter])

  function updateField(event) {
    setForm({ ...form, [event.target.name]: event.target.value })
  }

   async function submitForm(event) {
    event.preventDefault()
    setMessage('')

    try {
      const url = editing ? `${API}/${editing._id}` : API
      const res = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: form.companyName,
          jobRole: form.jobRole,
          jobType: form.jobType,
          appliedDate: form.appliedDate,
          expectedSalary: form.expectedSalary === '' ? null : Number(form.expectedSalary),
          notes: form.notes
        })
      })

      const result = await res.json()

      if (!res.ok || !result.success) {
        setMessage(result.message || 'Could not save application')
        return
      }

      setMessage(editing ? 'Application updated successfully!' : 'Application added successfully!')
      setShowForm(false)
      setEditing(null)
      setForm(emptyForm)
      loadApplications()
    } catch {
      setMessage('Cannot connect to backend.')
    }
  }

  function startEdit(item) {
    setEditing(item)
    setForm({
      companyName: item.companyName,
      jobRole: item.jobRole,
      jobType: item.jobType,
      appliedDate: new Date(item.appliedDate).toLocaleDateString('en-CA'),
      expectedSalary: item.expectedSalary ?? '',
      notes: item.notes || ''
    })
    setShowForm(true)
    setMessage('')
  }

  async function changeStatus(item, status) {
    if (!status) return

    try {
      const res = await fetch(`${API}/${item._id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      })
      const result = await res.json()
      setMessage(result.message || (res.ok ? 'Status updated' : 'Status update failed'))
      if (res.ok) loadApplications()
    } catch {
      setMessage('Cannot connect to backend.')
    }
  }

  async function deleteApplication(item) {
    if (!item.canDelete) {
      setMessage('Applications in Interview or Offer status cannot be deleted.')
      return
    }

    if (!window.confirm(`Delete the application for ${item.companyName}?`)) return

    try {
      const res = await fetch(`${API}/${item._id}`, { method: 'DELETE' })
      const result = await res.json()
      setMessage(result.message || (res.ok ? 'Deleted' : 'Delete failed'))
      if (res.ok) loadApplications()
    } catch {
      setMessage('Cannot connect to backend.')
    }
  }

  const statuses = ['Applied', 'Interview', 'Offer', 'Accepted', 'Rejected', 'Declined']

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">Career<span>Track</span></div>
        <span className="tagline">Your job search, organised.</span>
      </header>

      <section className="welcome">
        <div>
          <p className="eyebrow">JOB SEARCH DASHBOARD</p>
          <h1>Keep your career moving.</h1>
          <p className="subheading">Track applications, follow-ups, and every opportunity in one place.</p>
        </div>
        <button className="primary" onClick={() => {
          setEditing(null)
          setForm(emptyForm)
          setShowForm(!showForm)
          setMessage('')
        }}>
          + Add Application
        </button>
      </section>

      {message && <div className="notice">{message}</div>}

      <section className="stats">
        <div className="stat-card"><span>Total applications</span><strong>{Object.values(counts).reduce((a, b) => a + Number(b), 0)}</strong></div>
        {statuses.map(status => (
          <div className="stat-card" key={status}>
            <span>{status}</span><strong>{counts[status] || 0}</strong>
          </div>
        ))}
      </section>

      {showForm && (
        <section className="panel form-panel">
          <div className="panel-heading">
            <h2>{editing ? 'Edit application' : 'Add a new application'}</h2>
            <button className="text-button" onClick={() => { setShowForm(false); setEditing(null) }}>Cancel</button>
          </div>
          <form onSubmit={submitForm} className="application-form">
            <label>Company Name *
              <input name="companyName" value={form.companyName} onChange={updateField} required maxLength="100" />
            </label>
            <label>Job Role *
              <input name="jobRole" value={form.jobRole} onChange={updateField} required maxLength="100" />
            </label>
            <label>Job Type *
              <select name="jobType" value={form.jobType} onChange={updateField} required>
                <option>Full-time</option>
                <option>Internship</option>
                <option>Contract</option>
              </select>
            </label>
            <label>Applied Date *
              <input type="date" name="appliedDate" value={form.appliedDate} max={new Date().toLocaleDateString('en-CA')} onChange={updateField} required disabled={Boolean(editing)} />
            </label>
            <label>Expected Salary (optional)
              <input type="number" min="0" name="expectedSalary" value={form.expectedSalary} onChange={updateField} placeholder="e.g. 500000" />
            </label>
            <label className="wide">Notes (optional)
              <textarea name="notes" value={form.notes} onChange={updateField} rows="3" placeholder="Interview details, follow-up notes..." />
            </label>
            <div className="wide"><button className="primary" type="submit">{editing ? 'Save changes' : 'Save application'}</button></div>
          </form>
        </section>
      )}

      <section className="panel">
        <div className="panel-heading">
          <div><h2>Your applications</h2><p className="muted">Review and manage your opportunities.</p></div>
          <button className="secondary" onClick={loadApplications}>Refresh</button>
        </div>

        <div className="filters">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search company..." aria-label="Search company" />
          <select value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filter status">
            <option value="">All statuses</option>
            {statuses.map(status => <option key={status}>{status}</option>)}
          </select>
        </div>

        {applications.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">↗</div>
            <h3>No applications found</h3>
            <p>Add your first application or change your search filters.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Application</th><th>Role / Type</th><th>Applied date</th><th>Status</th><th>Follow-up</th><th>Actions</th></tr></thead>
              <tbody>
                {applications.map(item => (
                  <tr key={item._id}>
                    <td><strong>{item.companyName}</strong><small>{item.applicationId}</small></td>
                    <td>{item.jobRole}<small>{item.jobType}</small></td>
                    <td>{new Date(item.appliedDate).toLocaleDateString()}</td>
                    <td>
                      <span className={`badge ${item.status.toLowerCase()}`}>{item.status}</span>
                      {item.isOverdue && <small className="overdue">Follow-up overdue</small>}
                    </td>
                    <td>{new Date(item.followUpDate).toLocaleDateString()}</td>
                    <td className="actions">
                      {item.allowedNextStatuses?.length > 0 && (
                        <select value="" onChange={e => changeStatus(item, e.target.value)} aria-label={`Change status for ${item.companyName}`}>
                          <option value="">Change status</option>
                          {item.allowedNextStatuses.map(status => <option key={status}>{status}</option>)}
                        </select>
                      )}
                      <button className="small-btn" onClick={() => startEdit(item)}>Edit</button>
                      <button className="small-btn delete" disabled={!item.canDelete} title={!item.canDelete ? 'Cannot delete during Interview or Offer' : 'Delete application'} onClick={() => deleteApplication(item)}>Delete</button>
                      {item.statusHistory?.length > 0 && (
                        <details className="history">
                          <summary>History</summary>
                          {item.statusHistory.map((entry, i) => <p key={i}>{entry.status} — {new Date(entry.date).toLocaleString()}</p>)}
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer>CareerTrack · Built to keep your job search on track.</footer>
    </main>
  )
}

export default App
