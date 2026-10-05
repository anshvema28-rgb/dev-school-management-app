import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Platform,

  KeyboardAvoidingView,
} from 'react-native'
import { Alert } from './safeAlert'
import { supabase } from './supabaseClient'

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

const pad2 = (n: number) => String(n).padStart(2, '0')

const localISODate = (d: Date = new Date()) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

const fmtDate = (iso: string) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return `${pad2(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

const AUDIENCES = ['all', 'students', 'teachers', 'parents']

const EMPTY_FORM = {
  title: '',
  content: '',
  target_audience: 'all',
  expiry_date: '',
}

export default function NoticesScreen({ route, navigation }: any) {
  const [notices, setNotices] = useState<any[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft' | 'expired'>('all')
  const [audienceFilter, setAudienceFilter] = useState<string | null>(null)

  // Form
  const [showForm, setShowForm] = useState(false)
  const [editingNotice, setEditingNotice] = useState<any>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // Detail
  const [detailNotice, setDetailNotice] = useState<any>(null)

  const handleBack = () => {
    if (navigation && navigation.goBack) navigation.goBack()
  }

  // ---- Load role + notices ----
  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const { data: sess } = await supabase.auth.getSession()
      const u = sess && sess.session ? sess.session.user : null
      if (!u) {
        setLoading(false)
        return
      }

      const { data: prof } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', u.id)
        .maybeSingle()
      setIsAdmin(prof != null && prof.role === 'admin')

      // RLS decides what each role may read. Admin sees everything (002);
      // others see only published, audience-relevant, unexpired notices.
      const { data, error: nErr } = await supabase
        .from('notices')
        .select('id, title, content, target_audience, is_published, published_at, expiry_date, created_at, updated_at')
        .order('created_at', { ascending: false })
        .limit(100)
      if (nErr) throw nErr
      setNotices((data || []) as any[])
    } catch (err: any) {
      setError(err.message || 'Unable to load notices')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // ---- Admin CRUD ----
  const openAddForm = () => {
    setEditingNotice(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  const openEditForm = (n: any) => {
    setEditingNotice(n)
    setForm({
      title: n.title || '',
      content: n.content || '',
      target_audience: n.target_audience || 'all',
      expiry_date: n.expiry_date ? String(n.expiry_date).slice(0, 10) : '',
    })
    setShowForm(true)
  }

  const saveNotice = async () => {
    if (!form.title.trim()) {
      Alert.alert('Validation', 'Please enter a title.')
      return
    }
    if (!form.content.trim()) {
      Alert.alert('Validation', 'Please enter content.')
      return
    }
    if (!form.target_audience) {
      Alert.alert('Validation', 'Please select a target audience.')
      return
    }

    setSaving(true)
    try {
      const payload = {
        title: form.title.trim(),
        content: form.content.trim(),
        target_audience: form.target_audience,
        expiry_date: form.expiry_date || null,
      }

      if (editingNotice && editingNotice.id) {
        const { error } = await supabase
          .from('notices')
          .update(payload)
          .eq('id', editingNotice.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('notices').insert(payload)
        if (error) throw error
      }

      Alert.alert('Success', editingNotice ? 'Notice updated' : 'Notice created as draft')
      setShowForm(false)
      setEditingNotice(null)
      setForm(EMPTY_FORM)
      load()
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Unable to save notice')
    } finally {
      setSaving(false)
    }
  }

  const publishNotice = async (n: any) => {
    try {
      const { error } = await supabase
        .from('notices')
        .update({ is_published: true, published_at: new Date().toISOString() })
        .eq('id', n.id)
      if (error) throw error
      load()
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Unable to publish notice')
    }
  }

  const unpublishNotice = async (n: any) => {
    try {
      const { error } = await supabase
        .from('notices')
        .update({ is_published: false, published_at: null })
        .eq('id', n.id)
      if (error) throw error
      load()
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Unable to unpublish notice')
    }
  }

  const deleteNotice = (n: any) => {
    Alert.alert('Delete Notice', `Delete "${n.title}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase.from('notices').delete().eq('id', n.id)
            if (error) throw error
            setDetailNotice(null)
            load()
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Unable to delete notice')
          }
        },
      },
    ])
  }

  // ---- Derived ----
  const nowMs = Date.now()
  const noticeStatus = (n: any): 'draft' | 'published' | 'expired' => {
    if (!n.is_published) return 'draft'
    if (n.expiry_date && new Date(n.expiry_date).getTime() <= nowMs) return 'expired'
    return 'published'
  }

  const filteredNotices = notices.filter((n) => {
    if (statusFilter !== 'all' && noticeStatus(n) !== statusFilter) return false
    if (audienceFilter && n.target_audience !== audienceFilter) return false
    const q = search.trim().toLowerCase()
    if (q && !n.title.toLowerCase().includes(q) && !n.content.toLowerCase().includes(q))
      return false
    return true
  })

  const statusBadge = (n: any) => {
    const st = noticeStatus(n)
    if (st === 'published') return { bg: styles.badgeOk, text: styles.badgeTextOk, label: 'Published' }
    if (st === 'expired') return { bg: styles.badgeWarn, text: styles.badgeTextWarn, label: 'Expired' }
    return { bg: styles.badgeDraft, text: styles.badgeTextDraft, label: 'Draft' }
  }

  const audienceBadge = (a: string) => {
    if (a === 'all') return { bg: styles.audOk, text: styles.audTextOk }
    if (a === 'class') return { bg: styles.audWarn, text: styles.audTextWarn }
    return { bg: styles.audInfo, text: styles.audTextInfo }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Notices</Text>
        <View style={styles.headerActions}>
          {isAdmin ? (
            <TouchableOpacity style={styles.createBtn} onPress={openAddForm} activeOpacity={0.8}>
              <Text style={styles.createBtnText}>＋ New Notice</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.backButton} onPress={handleBack} activeOpacity={0.7}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Search (admin) */}
      {isAdmin ? (
        <View style={styles.searchBox}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search notices…"
            placeholderTextColor="#9E9E9E"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
          />
        </View>
      ) : null}

      {/* Filters (admin) */}
      {isAdmin ? (
        <View style={styles.filterSection}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterScroll}
            contentContainerStyle={styles.filterRow}
          >
            {(['all', 'published', 'draft', 'expired'] as const).map((f) => {
              const active = statusFilter === f
              return (
                <TouchableOpacity
                  key={f}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setStatusFilter(f)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterScroll}
            contentContainerStyle={styles.filterRow}
          >
            <TouchableOpacity
              style={[styles.filterChip, !audienceFilter && styles.filterChipActive]}
              onPress={() => setAudienceFilter(null)}
              activeOpacity={0.8}
            >
              <Text style={[styles.filterChipText, !audienceFilter && styles.filterChipTextActive]}>
                All Audiences
              </Text>
            </TouchableOpacity>
            {AUDIENCES.map((a) => {
              const active = audienceFilter === a
              return (
                <TouchableOpacity
                  key={a}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setAudienceFilter(a)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                    {a}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1A237E" />
          <Text style={styles.hint}>Loading notices…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {filteredNotices.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                {isAdmin ? 'No notices found' : 'No published notices for you'}
              </Text>
            </View>
          ) : (
            filteredNotices.map((n) => {
              const sb = statusBadge(n)
              const ab = audienceBadge(n.target_audience)
              return (
                <View key={n.id} style={styles.card3d}>
                  <View style={styles.card}>
                    <TouchableOpacity
                      style={styles.cardMain}
                      onPress={() => setDetailNotice(n)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.cardBody}>
                        <Text style={styles.cardTitle} numberOfLines={1}>
                          {n.title}
                        </Text>
                        <Text style={styles.cardMeta} numberOfLines={2}>
                          {n.content}
                        </Text>
                        <Text style={styles.cardDate}>
                          {n.is_published
                            ? `Published ${fmtDate(n.published_at || n.created_at)}`
                            : `Created ${fmtDate(n.created_at)}`}
                          {n.expiry_date ? ` • Expires ${fmtDate(n.expiry_date)}` : ''}
                        </Text>
                      </View>
                    </TouchableOpacity>
                    <View style={styles.cardBadges}>
                      <View style={[styles.badge, sb.bg]}>
                        <Text style={[styles.badgeText, sb.text]}>{sb.label}</Text>
                      </View>
                      <View style={[styles.audBadge, ab.bg]}>
                        <Text style={[styles.audText, ab.text]}>{n.target_audience}</Text>
                      </View>
                    </View>
                    {isAdmin ? (
                      <View style={styles.cardActions}>
                        <TouchableOpacity
                          style={styles.actionBtn}
                          onPress={() => setDetailNotice(n)}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.actionBtnText}>View</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.actionBtn}
                          onPress={() => openEditForm(n)}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.actionBtnText}>Edit</Text>
                        </TouchableOpacity>
                        {n.is_published ? (
                          <TouchableOpacity
                            style={styles.actionBtn}
                            onPress={() => unpublishNotice(n)}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.actionBtnText}>Unpublish</Text>
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            style={[styles.actionBtn, styles.actionBtnPublish]}
                            onPress={() => publishNotice(n)}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.actionBtnPublishText}>Publish</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.actionBtnDanger]}
                          onPress={() => deleteNotice(n)}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.actionBtnDangerText}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                </View>
              )
            })
          )}
        </ScrollView>
      )}

      {/* ---- Detail overlay ---- */}
      {detailNotice ? (
        <View style={styles.overlay}>
          <View style={styles.overlayHeader}>
            <Text style={styles.overlayTitle}>Notice Details</Text>
            <TouchableOpacity onPress={() => setDetailNotice(null)} activeOpacity={0.7}>
              <Text style={styles.overlayClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.overlayScroll}
            contentContainerStyle={styles.overlayContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.detailTitle}>{detailNotice.title}</Text>
            <View style={styles.detailBadges}>
              {(() => {
                const sb = statusBadge(detailNotice)
                const ab = audienceBadge(detailNotice.target_audience)
                return (
                  <>
                    <View style={[styles.badge, sb.bg]}>
                      <Text style={[styles.badgeText, sb.text]}>{sb.label}</Text>
                    </View>
                    <View style={[styles.audBadge, ab.bg]}>
                      <Text style={[styles.audText, ab.text]}>
                        {detailNotice.target_audience}
                      </Text>
                    </View>
                  </>
                )
              })()}
            </View>
            <Text style={styles.detailContent}>{detailNotice.content}</Text>
            <View style={styles.detailGrid}>
              <DetailRow
                label="Published"
                value={
                  detailNotice.is_published
                    ? fmtDate(detailNotice.published_at || detailNotice.created_at)
                    : 'Not published'
                }
              />
              <DetailRow
                label="Expires"
                value={detailNotice.expiry_date ? fmtDate(detailNotice.expiry_date) : 'No expiry'}
              />
              <DetailRow label="Created" value={fmtDate(detailNotice.created_at)} />
              <DetailRow label="Audience" value={detailNotice.target_audience} />
            </View>

            {isAdmin ? (
              <View style={styles.overlayActions}>
                <TouchableOpacity
                  style={styles.editBtn}
                  onPress={() => {
                    setDetailNotice(null)
                    openEditForm(detailNotice)
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.editBtnText}>Edit Notice</Text>
                </TouchableOpacity>
                {detailNotice.is_published ? (
                  <TouchableOpacity
                    style={styles.unpublishBtn}
                    onPress={() => {
                      setDetailNotice(null)
                      unpublishNotice(detailNotice)
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.unpublishBtnText}>Unpublish</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.publishBtn}
                    onPress={() => {
                      setDetailNotice(null)
                      publishNotice(detailNotice)
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.publishBtnText}>Publish</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : null}
          </ScrollView>
        </View>
      ) : null}

      {/* ---- Add / Edit form overlay (admin) ---- */}
      {showForm && isAdmin ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.formOverlay}
        >
          <View style={styles.formHeader}>
            <Text style={styles.formTitle}>
              {editingNotice ? 'Edit Notice' : 'Create Notice'}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setShowForm(false)
                setEditingNotice(null)
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.formClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.formScroll}
            contentContainerStyle={styles.formContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.formLabel}>Title</Text>
            <TextInput
              style={styles.formInput}
              value={form.title}
              onChangeText={(t) => setForm({ ...form, title: t })}
              placeholder="Notice title"
              placeholderTextColor="#9E9E9E"
            />

            <Text style={styles.formLabel}>Content</Text>
            <TextInput
              style={[styles.formInput, styles.formTextArea]}
              value={form.content}
              onChangeText={(t) => setForm({ ...form, content: t })}
              placeholder="Notice content"
              placeholderTextColor="#9E9E9E"
              multiline
              numberOfLines={5}
            />

            <Text style={styles.formLabel}>Target Audience</Text>
            <View style={styles.chipRow}>
              {AUDIENCES.map((a) => {
                const active = form.target_audience === a
                return (
                  <TouchableOpacity
                    key={a}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setForm({ ...form, target_audience: a })}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {a}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            <Text style={styles.formLabel}>Expiry Date (optional)</Text>
            <TextInput
              style={styles.formInput}
              value={form.expiry_date}
              onChangeText={(t) => setForm({ ...form, expiry_date: t })}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#9E9E9E"
            />

            <Text style={styles.formNote}>
              New notices are created as drafts. Publish them when ready.
            </Text>

            <View style={styles.formActions}>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={saveNotice}
                activeOpacity={0.85}
                disabled={saving}
              >
                <Text style={styles.saveBtnText}>
                  {saving ? 'Saving…' : editingNotice ? 'Update Notice' : 'Create Draft'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  setShowForm(false)
                  setEditingNotice(null)
                  setForm(EMPTY_FORM)
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      ) : null}
    </View>
  )
}

const DetailRow = ({ label, value }: { label: string; value: any }) => (
  <View style={styles.detailRow}>
    <Text style={styles.detailLabel}>{label}</Text>
    <Text style={styles.detailValue} numberOfLines={2}>
      {value || '—'}
    </Text>
  </View>
)

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    paddingTop: Platform.OS === 'android' ? 36 : 18,
    paddingBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: '#1A237E',
    borderBottomWidth: 1,
    borderBottomColor: '#BBDEFB',
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  createBtn: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginRight: 8,
  },
  createBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  backButton: {
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  backText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },

  // ----- Search -----
  searchBox: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F5F8FF',
    borderBottomWidth: 1,
    borderBottomColor: '#E3ECFA',
  },
  searchInput: {
    height: 44,
    borderWidth: 1,
    borderColor: '#CFD8DC',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    fontSize: 14,
    color: '#212121',
  },

  // ----- Filters -----
  filterSection: {
    backgroundColor: '#F5F8FF',
    borderBottomWidth: 1,
    borderBottomColor: '#E3ECFA',
    paddingBottom: 8,
  },
  filterScroll: {
    marginBottom: 4,
  },
  filterRow: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#1A237E',
    borderColor: '#1A237E',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#424242',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },

  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  hint: {
    marginTop: 12,
    fontSize: 13,
    color: '#6B7280',
  },
  errorText: {
    color: '#C62828',
    fontSize: 13,
    textAlign: 'center',
  },
  emptyCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: '#757575',
    fontSize: 14,
  },

  // ----- 3D notice cards -----
  card3d: {
    marginBottom: 14,
    backgroundColor: '#101652',
    borderRadius: 16,
    paddingRight: 4,
    paddingBottom: 4,
    elevation: 6,
    shadowColor: '#1A237E',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EEF1FA',
    padding: 12,
  },
  cardMain: {
    marginBottom: 8,
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1A237E',
    marginBottom: 4,
  },
  cardMeta: {
    fontSize: 12,
    color: '#424242',
    lineHeight: 17,
  },
  cardDate: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 6,
  },
  cardBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeOk: {
    backgroundColor: '#E8F5E9',
  },
  badgeWarn: {
    backgroundColor: '#FFF3E0',
  },
  badgeDraft: {
    backgroundColor: '#ECEFF1',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  badgeTextOk: {
    color: '#2E7D32',
  },
  badgeTextWarn: {
    color: '#E65100',
  },
  badgeTextDraft: {
    color: '#546E7A',
  },
  audBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  audInfo: {
    backgroundColor: '#E3F2FD',
  },
  audOk: {
    backgroundColor: '#E8F5E9',
  },
  audWarn: {
    backgroundColor: '#FFF3E0',
  },
  audText: {
    fontSize: 10,
    fontWeight: '800',
  },
  audTextInfo: {
    color: '#1565C0',
  },
  audTextOk: {
    color: '#2E7D32',
  },
  audTextWarn: {
    color: '#E65100',
  },
  cardActions: {
    flexDirection: 'row',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F5FB',
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#EAF4FF',
    alignItems: 'center',
    marginRight: 6,
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1B5FBF',
  },
  actionBtnPublish: {
    backgroundColor: '#E8F5E9',
  },
  actionBtnPublishText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2E7D32',
  },
  actionBtnDanger: {
    backgroundColor: '#FFEBEE',
    marginRight: 0,
  },
  actionBtnDangerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#C62828',
  },

  // ----- Detail overlay -----
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    zIndex: 50,
  },
  overlayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'android' ? 36 : 18,
    paddingBottom: 14,
    paddingHorizontal: 16,
    backgroundColor: '#1A237E',
  },
  overlayTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  overlayClose: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    padding: 4,
  },
  overlayScroll: {
    flex: 1,
  },
  overlayContent: {
    padding: 16,
    paddingBottom: 40,
  },
  detailTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1A237E',
    marginBottom: 10,
  },
  detailBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  detailContent: {
    fontSize: 14,
    color: '#424242',
    lineHeight: 21,
    marginBottom: 16,
  },
  detailGrid: {
    backgroundColor: '#FAFAFA',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EEF1FA',
    padding: 4,
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F5FB',
  },
  detailLabel: {
    width: 100,
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
  },
  detailValue: {
    flex: 1,
    fontSize: 13,
    color: '#212121',
  },
  overlayActions: {
    flexDirection: 'row',
    gap: 10,
  },
  editBtn: {
    flex: 1,
    backgroundColor: '#1A237E',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  editBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  unpublishBtn: {
    flex: 1,
    backgroundColor: '#FFF3E0',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  unpublishBtnText: {
    color: '#E65100',
    fontSize: 14,
    fontWeight: '700',
  },
  publishBtn: {
    flex: 1,
    backgroundColor: '#2E7D32',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  publishBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },

  // ----- Form overlay -----
  formOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    zIndex: 60,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'android' ? 36 : 18,
    paddingBottom: 14,
    paddingHorizontal: 16,
    backgroundColor: '#1A237E',
  },
  formTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  formClose: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    padding: 4,
  },
  formScroll: {
    flex: 1,
  },
  formContent: {
    padding: 16,
    paddingBottom: 40,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1A237E',
    letterSpacing: 0.4,
    marginBottom: 6,
    marginTop: 10,
  },
  formInput: {
    height: 46,
    borderWidth: 1,
    borderColor: '#CFD8DC',
    borderRadius: 10,
    backgroundColor: '#FAFAFA',
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#212121',
  },
  formTextArea: {
    height: 110,
    textAlignVertical: 'top',
    paddingTop: 10,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginRight: 8,
    marginBottom: 8,
  },
  chipActive: {
    backgroundColor: '#1A237E',
    borderColor: '#1A237E',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#424242',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  formNote: {
    fontSize: 11,
    color: '#6B7280',
    backgroundColor: '#EAF4FF',
    borderRadius: 10,
    padding: 10,
    marginTop: 12,
    lineHeight: 16,
  },
  formActions: {
    flexDirection: 'row',
    marginTop: 20,
  },
  saveBtn: {
    flex: 1,
    backgroundColor: '#1A237E',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginRight: 10,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#ECEFF1',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#546E7A',
    fontSize: 14,
    fontWeight: '700',
  },
})
