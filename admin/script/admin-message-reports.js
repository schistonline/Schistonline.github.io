// ============================================
// SUPABASE CONFIGURATION
// ============================================
const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
let currentUser = null;
let reports = [];
let filteredReports = [];
let selectedReports = new Set();
let currentPage = 1;
let hasMoreReports = true;
let isLoading = false;
let currentReport = null;
let currentMessage = null;
let currentUser_ = null;

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    await checkAdminStatus();
    await loadStats();
    await loadReports();
    setupEventListeners();
    setupRealtimeSubscription();
});

// ============================================
// AUTHENTICATION
// ============================================
async function checkAuth() {
    try {
        const { data: { user } } = await sb.auth.getUser();
        if (!user) {
            window.location.href = 'login.html?redirect=admin-message-reports.html';
            return;
        }
        currentUser = user;
    } catch (error) {
        console.error('Auth error:', error);
        window.location.href = 'login.html';
    }
}

async function checkAdminStatus() {
    try {
        const { data, error } = await sb
            .from('profiles')
            .select('is_admin, admin_role')
            .eq('id', currentUser.id)
            .single();
            
        if (error) throw error;
        
        if (!data.is_admin) {
            showToast('Admin access required');
            setTimeout(() => window.location.href = 'index.html', 2000);
        }
    } catch (error) {
        console.error('Error checking admin status:', error);
        window.location.href = 'index.html';
    }
}

// ============================================
// LOAD STATS
// ============================================
async function loadStats() {
    try {
        // Pending reports
        const { count: pending } = await sb
            .from('message_reports')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');
            
        // Resolved reports
        const { count: resolved } = await sb
            .from('message_reports')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'resolved');
            
        // Dismissed reports
        const { count: dismissed } = await sb
            .from('message_reports')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'dismissed');
            
        // Critical reports (spam, harassment, scam)
        const { count: critical } = await sb
            .from('message_reports')
            .select('*', { count: 'exact', head: true })
            .in('reason', ['spam', 'harassment', 'scam'])
            .eq('status', 'pending');
            
        document.getElementById('pendingReports').textContent = pending || 0;
        document.getElementById('resolvedReports').textContent = resolved || 0;
        document.getElementById('dismissedReports').textContent = dismissed || 0;
        document.getElementById('criticalReports').textContent = critical || 0;
        
        document.getElementById('allCount').textContent = (pending || 0) + (resolved || 0) + (dismissed || 0);
        document.getElementById('highCount').textContent = critical || 0;
        document.getElementById('mediumCount').textContent = (pending || 0) - (critical || 0);
        document.getElementById('lowCount').textContent = 0;
        
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// ============================================
// LOAD REPORTS
// ============================================
async function loadReports(reset = true) {
    if (isLoading) return;
    
    isLoading = true;
    
    if (reset) {
        currentPage = 1;
        hasMoreReports = true;
        document.getElementById('reportsList').innerHTML = '';
        showLoading(true);
    }
    
    try {
        const from = (currentPage - 1) * 20;
        const to = from + 20 - 1;
        
        let query = sb
            .from('message_reports')
            .select(`
                *,
                reporter:profiles!message_reports_reporter_id_fkey (
                    id, full_name, business_name, avatar_url, is_supplier, is_buyer
                ),
                resolver:profiles!message_reports_resolved_by_fkey (
                    id, full_name, business_name
                ),
                message:messages!message_reports_message_id_fkey (
                    id, content, created_at, sender_id, receiver_id,
                    sender:profiles!messages_sender_id_fkey (
                        id, full_name, business_name, avatar_url
                    ),
                    receiver:profiles!messages_receiver_id_fkey (
                        id, full_name, business_name
                    )
                )
            `)
            .order('created_at', { ascending: false })
            .range(from, to);
            
        // Apply filters
        const filters = getActiveFilters();
        
        if (filters.status !== 'all') {
            query = query.eq('status', filters.status);
        }
        
        if (filters.reason !== 'all') {
            query = query.eq('reason', filters.reason);
        }
        
        if (filters.dateRange !== 'all') {
            const dateFilter = getDateFilter(filters.dateRange);
            if (dateFilter) {
                query = query.gte('created_at', dateFilter);
            }
        }
        
        if (filters.search) {
            query = query.or(`reason.ilike.%${filters.search}%,details.ilike.%${filters.search}%,reporter.full_name.ilike.%${filters.search}%,reporter.business_name.ilike.%${filters.search}%`);
        }
        
        const { data, error } = await query;
            
        if (error) throw error;
        
        if (data.length < 20) {
            hasMoreReports = false;
            document.getElementById('loadMore').style.display = 'none';
        } else {
            document.getElementById('loadMore').style.display = 'block';
        }
        
        // Determine priority for each report
        const reportsWithPriority = data.map(report => ({
            ...report,
            priority: determinePriority(report)
        }));
        
        if (reset) {
            reports = reportsWithPriority;
            filteredReports = reportsWithPriority;
        } else {
            reports = [...reports, ...reportsWithPriority];
            filteredReports = [...filteredReports, ...reportsWithPriority];
        }
        
        renderReports();
        
    } catch (error) {
        console.error('Error loading reports:', error);
        showToast('Failed to load reports');
    } finally {
        isLoading = false;
        showLoading(false);
    }
}

// ============================================
// RENDER FUNCTIONS
// ============================================
function renderReports() {
    const list = document.getElementById('reportsList');
    const emptyState = document.getElementById('emptyState');
    
    if (filteredReports.length === 0) {
        list.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }
    
    list.style.display = 'block';
    emptyState.style.display = 'none';
    
    list.innerHTML = filteredReports.map(report => {
        const reporter = report.reporter || {};
        const reporterName = reporter.business_name || reporter.full_name || 'Unknown User';
        const reporterInitials = getInitials(reporterName);
        const message = report.message || {};
        const messageSender = message.sender || {};
        const messageSenderName = messageSender.business_name || messageSender.full_name || 'Unknown';
        const priorityClass = report.priority === 'high' ? 'high-priority' : 
                            report.priority === 'medium' ? 'medium-priority' : 'low-priority';
        
        return `
            <div class="report-card ${priorityClass}" data-report-id="${report.id}">
                <input type="checkbox" class="report-checkbox" value="${report.id}" onchange="toggleReportSelection(${report.id})">
                
                <div class="report-header" onclick="viewReport(${report.id})">
                    <div class="reporter-info">
                        <div class="reporter-avatar">
                            ${reporter.avatar_url ? 
                                `<img src="${reporter.avatar_url}" alt="${reporterName}">` : 
                                reporterInitials
                            }
                        </div>
                        <div class="reporter-details">
                            <div class="reporter-name">${escapeHtml(reporterName)}</div>
                            <div class="reporter-meta">
                                <span>${reporter.is_supplier ? 'Supplier' : reporter.is_buyer ? 'Buyer' : 'User'}</span>
                                <span>•</span>
                                <span>Reported ${formatTimeAgo(report.created_at)}</span>
                            </div>
                        </div>
                    </div>
                    <div class="report-badge ${report.status}">${report.status}</div>
                </div>
                
                <div class="report-reason" onclick="viewReport(${report.id})">
                    <div class="reason-title">${formatReason(report.reason)}</div>
                    <div class="reason-description">${escapeHtml(report.details || 'No additional details provided')}</div>
                </div>
                
                <div class="message-preview" onclick="viewMessageContext(${message.id})">
                    <div class="message-sender">From: ${escapeHtml(messageSenderName)}</div>
                    <div class="message-content">${escapeHtml(truncate(message.content, 150))}</div>
                    <div class="message-time">${formatTimeAgo(message.created_at)}</div>
                </div>
                
                <div class="report-footer">
                    <div class="report-time">
                        <i class="far fa-clock"></i> Reported ${formatTimeAgo(report.created_at)}
                    </div>
                    <div class="report-actions">
                        ${report.status === 'pending' ? `
                            <button class="action-btn success" onclick="showResolveModal(${report.id})">
                                <i class="fas fa-check"></i> Resolve
                            </button>
                            <button class="action-btn warning" onclick="showResolveModal(${report.id})">
                                <i class="fas fa-times"></i> Dismiss
                            </button>
                        ` : `
                            <span class="action-btn" disabled>Resolved ${formatTimeAgo(report.resolved_at)}</span>
                        `}
                        <button class="action-btn primary" onclick="viewUser(${reporter.id})">
                            <i class="fas fa-user"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// VIEW FUNCTIONS
// ============================================
window.viewReport = function(reportId) {
    const report = reports.find(r => r.id === reportId);
    if (!report) return;
    
    currentReport = report;
    
    const reporter = report.reporter || {};
    const resolver = report.resolver || {};
    const message = report.message || {};
    const messageSender = message.sender || {};
    
    const detail = document.getElementById('reportDetail');
    detail.innerHTML = `
        <div class="detail-section">
            <h4><i class="fas fa-flag"></i> Report Information</h4>
            <div class="detail-row">
                <span class="detail-label">Report ID:</span>
                <span class="detail-value">${report.id}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Reason:</span>
                <span class="detail-value">${formatReason(report.reason)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Status:</span>
                <span class="detail-value">${report.status}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Priority:</span>
                <span class="detail-value">${report.priority}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Reported:</span>
                <span class="detail-value">${formatDateTime(report.created_at)}</span>
            </div>
        </div>
        
        <div class="detail-section">
            <h4><i class="fas fa-user"></i> Reporter</h4>
            <div class="detail-row">
                <span class="detail-label">Name:</span>
                <span class="detail-value">${escapeHtml(reporter.business_name || reporter.full_name || 'Unknown')}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">ID:</span>
                <span class="detail-value">${reporter.id || 'N/A'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Type:</span>
                <span class="detail-value">${reporter.is_supplier ? 'Supplier' : reporter.is_buyer ? 'Buyer' : 'User'}</span>
            </div>
        </div>
        
        <div class="detail-section">
            <h4><i class="fas fa-envelope"></i> Reported Message</h4>
            <div class="detail-row">
                <span class="detail-label">From:</span>
                <span class="detail-value">${escapeHtml(messageSender.business_name || messageSender.full_name || 'Unknown')}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">To:</span>
                <span class="detail-value">${escapeHtml(message.receiver?.business_name || message.receiver?.full_name || 'Unknown')}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Sent:</span>
                <span class="detail-value">${formatDateTime(message.created_at)}</span>
            </div>
            <div class="detail-content">${escapeHtml(message.content || 'No content')}</div>
        </div>
        
        ${report.details ? `
            <div class="detail-section">
                <h4><i class="fas fa-sticky-note"></i> Additional Details</h4>
                <div class="detail-content">${escapeHtml(report.details)}</div>
            </div>
        ` : ''}
        
        ${report.status !== 'pending' ? `
            <div class="detail-section">
                <h4><i class="fas fa-check-circle"></i> Resolution</h4>
                <div class="detail-row">
                    <span class="detail-label">Resolved by:</span>
                    <span class="detail-value">${escapeHtml(resolver.business_name || resolver.full_name || 'Unknown')}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Resolved at:</span>
                    <span class="detail-value">${formatDateTime(report.resolved_at)}</span>
                </div>
            </div>
        ` : ''}
    `;
    
    document.getElementById('reportModal').classList.add('show');
};

window.viewMessageContext = async function(messageId) {
    try {
        const { data: message, error } = await sb
            .from('messages')
            .select(`
                *,
                sender:profiles!messages_sender_id_fkey (
                    id, full_name, business_name, avatar_url
                ),
                receiver:profiles!messages_receiver_id_fkey (
                    id, full_name, business_name
                )
            `)
            .eq('id', messageId)
            .single();
            
        if (error) throw error;
        
        currentMessage = message;
        
        // Get conversation context
        const { data: conversation } = await sb
            .from('messages')
            .select(`
                *,
                sender:profiles!messages_sender_id_fkey (
                    id, full_name, business_name, avatar_url
                )
            `)
            .eq('conversation_id', message.conversation_id)
            .order('created_at', { ascending: true })
            .limit(10);
        
        const messageContext = document.getElementById('messageContext');
        messageContext.innerHTML = `
            <div class="context-header">
                <span class="context-sender">${escapeHtml(message.sender?.business_name || message.sender?.full_name || 'Unknown')}</span>
                <span class="context-time">${formatDateTime(message.created_at)}</span>
            </div>
            <div class="context-content">${escapeHtml(message.content)}</div>
        `;
        
        const thread = document.getElementById('conversationThread');
        if (conversation && conversation.length > 0) {
            thread.innerHTML = conversation.map(msg => {
                const sender = msg.sender || {};
                return `
                    <div class="thread-message">
                        <div class="thread-avatar">
                            ${sender.avatar_url ? 
                                `<img src="${sender.avatar_url}" alt="${sender.business_name}">` : 
                                getInitials(sender.business_name || sender.full_name || 'U')
                            }
                        </div>
                        <div class="thread-content">
                            <div class="thread-header">
                                <span class="thread-sender">${escapeHtml(sender.business_name || sender.full_name || 'User')}</span>
                                <span class="thread-time">${formatTimeAgo(msg.created_at)}</span>
                            </div>
                            <div class="thread-text">${escapeHtml(msg.content)}</div>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            thread.innerHTML = '<p>No conversation context available</p>';
        }
        
        document.getElementById('messageModal').classList.add('show');
        
    } catch (error) {
        console.error('Error loading message context:', error);
        showToast('Failed to load message context');
    }
};

window.viewUser = async function(userId) {
    try {
        const { data, error } = await sb
            .from('profiles')
            .select(`
                *,
                sent:messages!messages_sender_id_fkey(count),
                received:messages!messages_receiver_id_fkey(count),
                reports_filed:message_reports!message_reports_reporter_id_fkey(count),
                reports_received:message_reports!message_reports_reported_user_id_fkey(count)
            `)
            .eq('id', userId)
            .single();
            
        if (error) throw error;
        
        currentUser_ = data;
        
        const userDetail = document.getElementById('userDetail');
        const name = data.business_name || data.full_name || 'Unknown';
        
        userDetail.innerHTML = `
            <div class="user-avatar-large">
                ${data.avatar_url ? 
                    `<img src="${data.avatar_url}" alt="${name}">` : 
                    getInitials(name)
                }
            </div>
            <h3 class="user-name-large">${escapeHtml(name)}</h3>
            <div class="user-email">${data.email || ''}</div>
            
            <div class="user-stats">
                <div class="user-stat">
                    <span class="user-stat-value">${data.sent?.count || 0}</span>
                    <span class="user-stat-label">Messages Sent</span>
                </div>
                <div class="user-stat">
                    <span class="user-stat-value">${data.received?.count || 0}</span>
                    <span class="user-stat-label">Messages Received</span>
                </div>
                <div class="user-stat">
                    <span class="user-stat-value">${data.reports_filed?.count || 0}</span>
                    <span class="user-stat-label">Reports Filed</span>
                </div>
                <div class="user-stat">
                    <span class="user-stat-value">${data.reports_received?.count || 0}</span>
                    <span class="user-stat-label">Reports Against</span>
                </div>
            </div>
            
            <div class="detail-section">
                <h4>Account Details</h4>
                <div class="detail-row">
                    <span class="detail-label">Joined:</span>
                    <span class="detail-value">${formatDate(data.created_at)}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Last Active:</span>
                    <span class="detail-value">${formatTimeAgo(data.last_active)}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Verified:</span>
                    <span class="detail-value">${data.is_verified ? 'Yes' : 'No'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Type:</span>
                    <span class="detail-value">
                        ${data.is_supplier ? 'Supplier ' : ''}
                        ${data.is_buyer ? 'Buyer ' : ''}
                        ${data.is_admin ? 'Admin' : ''}
                    </span>
                </div>
            </div>
            
            <div class="user-actions">
                <button class="btn-success" onclick="sendWarning('${data.id}')">Send Warning</button>
                <button class="btn-danger" onclick="showBlockModal('${data.id}', '${escapeHtml(name)}')">Block User</button>
            </div>
        `;
        
        document.getElementById('userModal').classList.add('show');
        
    } catch (error) {
        console.error('Error loading user:', error);
        showToast('Failed to load user');
    }
};

// ============================================
// REPORT ACTIONS
// ============================================
window.showResolveModal = function(reportId) {
    currentReport = reports.find(r => r.id === reportId);
    document.getElementById('resolveModal').classList.add('show');
};

window.confirmResolve = async function() {
    if (!currentReport) return;
    
    const action = document.querySelector('input[name="resolveAction"]:checked')?.value;
    const notes = document.getElementById('resolutionNotes').value;
    
    try {
        // Update report status
        const { error: updateError } = await sb
            .from('message_reports')
            .update({
                status: 'resolved',
                resolved_by: currentUser.id,
                resolved_at: new Date().toISOString(),
                resolution_notes: notes,
                resolution_action: action
            })
            .eq('id', currentReport.id);
            
        if (updateError) throw updateError;
        
        // Perform action based on selection
        if (action === 'warning') {
            await sendWarningNotification(currentReport.message?.sender_id, notes);
        } else if (action === 'mute') {
            await muteUser(currentReport.message?.sender_id, 24);
        } else if (action === 'block') {
            await blockUser(currentReport.message?.sender_id, 'temporary', notes);
        } else if (action === 'delete') {
            await deleteMessage(currentReport.message_id);
        }
        
        showSuccess('Report resolved successfully');
        closeResolveModal();
        await loadStats();
        await loadReports(true);
        
    } catch (error) {
        console.error('Error resolving report:', error);
        showToast('Failed to resolve report');
    }
};

window.dismissReport = async function(reportId) {
    if (!confirm('Dismiss this report?')) return;
    
    try {
        const { error } = await sb
            .from('message_reports')
            .update({
                status: 'dismissed',
                resolved_by: currentUser.id,
                resolved_at: new Date().toISOString()
            })
            .eq('id', reportId);
            
        if (error) throw error;
        
        showSuccess('Report dismissed');
        await loadStats();
        await loadReports(true);
        
    } catch (error) {
        console.error('Error dismissing report:', error);
        showToast('Failed to dismiss report');
    }
};

// ============================================
// USER ACTIONS
// ============================================
window.showBlockModal = function(userId, userName) {
    document.getElementById('blockUserName').textContent = userName;
    document.getElementById('blockModal').dataset.userId = userId;
    document.getElementById('blockModal').classList.add('show');
};

window.confirmBlock = async function() {
    const userId = document.getElementById('blockModal').dataset.userId;
    const duration = document.getElementById('blockDuration').value;
    const reason = document.getElementById('blockReason').value;
    
    try {
        await blockUser(userId, duration, reason);
        
        showSuccess('User blocked successfully');
        closeBlockModal();
        closeUserModal();
        
    } catch (error) {
        console.error('Error blocking user:', error);
        showToast('Failed to block user');
    }
};

window.sendWarning = async function(userId) {
    const notes = prompt('Enter warning message:');
    if (!notes) return;
    
    try {
        await sendWarningNotification(userId, notes);
        showSuccess('Warning sent to user');
    } catch (error) {
        console.error('Error sending warning:', error);
        showToast('Failed to send warning');
    }
};

// ============================================
// HELPER FUNCTIONS
// ============================================
async function sendWarningNotification(userId, message) {
    // Implementation would create a notification for the user
    console.log('Sending warning to user', userId, message);
}

async function muteUser(userId, hours) {
    // Implementation would mute the user
    console.log('Muting user', userId, 'for', hours, 'hours');
}

async function blockUser(userId, duration, reason) {
    // Implementation would block the user
    console.log('Blocking user', userId, 'duration:', duration, 'reason:', reason);
}

async function deleteMessage(messageId) {
    const { error } = await sb
        .from('messages')
        .delete()
        .eq('id', messageId);
        
    if (error) throw error;
}

function determinePriority(report) {
    const criticalReasons = ['scam', 'harassment'];
    const mediumReasons = ['spam', 'inappropriate'];
    
    if (criticalReasons.includes(report.reason)) {
        return 'high';
    } else if (mediumReasons.includes(report.reason)) {
        return 'medium';
    } else {
        return 'low';
    }
}

function formatReason(reason) {
    const reasons = {
        'spam': 'Spam',
        'harassment': 'Harassment',
        'scam': 'Scam/Fraud',
        'inappropriate': 'Inappropriate Content',
        'other': 'Other'
    };
    return reasons[reason] || reason;
}

// ============================================
// BULK ACTIONS
// ============================================
window.toggleReportSelection = function(reportId) {
    if (selectedReports.has(reportId)) {
        selectedReports.delete(reportId);
    } else {
        selectedReports.add(reportId);
    }
    
    const count = selectedReports.size;
    document.getElementById('bulkSelectedCount').textContent = count;
    
    if (count > 0) {
        document.getElementById('bulkModal').classList.add('show');
    }
};

window.bulkAction = async function(action) {
    if (selectedReports.size === 0) return;
    
    const reportIds = Array.from(selectedReports);
    
    try {
        if (action === 'resolve') {
            await sb
                .from('message_reports')
                .update({
                    status: 'resolved',
                    resolved_by: currentUser.id,
                    resolved_at: new Date().toISOString()
                })
                .in('id', reportIds);
                
            showSuccess(`${reportIds.length} reports resolved`);
            
        } else if (action === 'dismiss') {
            await sb
                .from('message_reports')
                .update({
                    status: 'dismissed',
                    resolved_by: currentUser.id,
                    resolved_at: new Date().toISOString()
                })
                .in('id', reportIds);
                
            showSuccess(`${reportIds.length} reports dismissed`);
            
        } else if (action === 'warning') {
            // Get all unique user IDs from reports
            const reports_ = reports.filter(r => reportIds.includes(r.id));
            const userIds = [...new Set(reports_.map(r => r.message?.sender_id).filter(id => id))];
            
            for (const userId of userIds) {
                await sendWarningNotification(userId, 'Multiple reports received');
            }
            
            showSuccess(`Warnings sent to ${userIds.length} users`);
            
        } else if (action === 'delete') {
            // Get all message IDs
            const reports_ = reports.filter(r => reportIds.includes(r.id));
            const messageIds = reports_.map(r => r.message_id).filter(id => id);
            
            for (const messageId of messageIds) {
                await deleteMessage(messageId);
            }
            
            showSuccess(`${messageIds.length} messages deleted`);
        }
        
        selectedReports.clear();
        closeBulkModal();
        await loadStats();
        await loadReports(true);
        
    } catch (error) {
        console.error('Error in bulk action:', error);
        showToast('Failed to perform bulk action');
    }
};

// ============================================
// FILTER FUNCTIONS
// ============================================
function getActiveFilters() {
    return {
        search: document.getElementById('searchReports').value,
        status: document.getElementById('statusFilter').value,
        reason: document.getElementById('reasonFilter').value,
        dateRange: document.getElementById('dateFilter').value
    };
}

function getDateFilter(range) {
    const date = new Date();
    
    switch(range) {
        case 'today':
            date.setHours(0, 0, 0, 0);
            return date.toISOString();
        case 'yesterday':
            date.setDate(date.getDate() - 1);
            date.setHours(0, 0, 0, 0);
            return date.toISOString();
        case 'week':
            date.setDate(date.getDate() - 7);
            return date.toISOString();
        case 'month':
            date.setDate(date.getDate() - 30);
            return date.toISOString();
        default:
            return null;
    }
}

window.applyFilters = function() {
    currentPage = 1;
    loadReports(true);
};

window.resetFilters = function() {
    document.getElementById('searchReports').value = '';
    document.getElementById('statusFilter').value = 'all';
    document.getElementById('reasonFilter').value = 'all';
    document.getElementById('dateFilter').value = 'all';
    
    applyFilters();
};

window.loadMoreReports = function() {
    if (hasMoreReports && !isLoading) {
        currentPage++;
        loadReports(false);
    }
};

window.setPriorityFilter = function(priority) {
    document.querySelectorAll('.priority-tab').forEach(el => {
        el.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Apply priority filter logic
    if (priority === 'high') {
        filteredReports = reports.filter(r => r.priority === 'high');
    } else if (priority === 'medium') {
        filteredReports = reports.filter(r => r.priority === 'medium');
    } else if (priority === 'low') {
        filteredReports = reports.filter(r => r.priority === 'low');
    } else {
        filteredReports = reports;
    }
    
    renderReports();
};

// ============================================
// EXPORT FUNCTIONS
// ============================================
window.exportReports = function() {
    const data = filteredReports.map(r => ({
        id: r.id,
        reason: r.reason,
        details: r.details,
        status: r.status,
        priority: r.priority,
        reporter: r.reporter?.business_name || r.reporter?.full_name,
        message_id: r.message_id,
        created_at: r.created_at,
        resolved_at: r.resolved_at
    }));
    
    exportToCSV(data);
};

function exportToCSV(data) {
    const headers = ['ID', 'Reason', 'Details', 'Status', 'Priority', 'Reporter', 'Message ID', 'Created', 'Resolved'];
    const csvContent = [
        headers.join(','),
        ...data.map(r => [
            r.id,
            `"${r.reason}"`,
            `"${(r.details || '').replace(/"/g, '""')}"`,
            r.status,
            r.priority,
            `"${r.reporter || ''}"`,
            r.message_id,
            r.created_at,
            r.resolved_at || ''
        ].join(','))
    ].join('\n');
    
    downloadFile(csvContent, 'message_reports_export.csv', 'text/csv');
}

function downloadFile(content, filename, contentType) {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
function showLoading(show) {
    document.getElementById('loadingState').style.display = show ? 'flex' : 'none';
    document.getElementById('reportsList').style.display = show ? 'none' : 'block';
}

function showSuccess(message) {
    document.getElementById('successMessage').textContent = message;
    document.getElementById('successModal').classList.add('show');
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function getInitials(name) {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

function truncate(str, length) {
    if (!str) return '';
    return str.length > length ? str.substring(0, length) + '...' : str;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTimeAgo(dateString) {
    return moment(dateString).fromNow();
}

function formatDateTime(dateString) {
    return moment(dateString).format('MMM D, YYYY h:mm A');
}

function formatDate(dateString) {
    return moment(dateString).format('MMM D, YYYY');
}

// ============================================
// MODAL FUNCTIONS
// ============================================
window.closeReportModal = () => document.getElementById('reportModal').classList.remove('show');
window.closeMessageModal = () => document.getElementById('messageModal').classList.remove('show');
window.closeUserModal = () => document.getElementById('userModal').classList.remove('show');
window.closeResolveModal = () => document.getElementById('resolveModal').classList.remove('show');
window.closeBlockModal = () => document.getElementById('blockModal').classList.remove('show');
window.closeBulkModal = () => document.getElementById('bulkModal').classList.remove('show');
window.closeSuccessModal = () => document.getElementById('successModal').classList.remove('show');

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
    // Refresh button
    document.getElementById('refreshBtn')?.addEventListener('click', () => {
        loadStats();
        loadReports(true);
    });
    
    // Export button
    document.getElementById('exportBtn')?.addEventListener('click', exportReports);
    
    // Resolve all button
    document.getElementById('resolveAllBtn')?.addEventListener('click', () => {
        if (confirm('Resolve all pending reports?')) {
            bulkAction('resolve');
        }
    });
    
    // Filters
    document.getElementById('searchReports')?.addEventListener('input', debounce(applyFilters, 500));
    document.getElementById('statusFilter')?.addEventListener('change', applyFilters);
    document.getElementById('reasonFilter')?.addEventListener('change', applyFilters);
    document.getElementById('dateFilter')?.addEventListener('change', applyFilters);
    
    // Priority tabs
    document.querySelectorAll('.priority-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            setPriorityFilter(e.target.dataset.priority);
        });
    });
    
    // Close modals on outside click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeReportModal();
                closeMessageModal();
                closeUserModal();
                closeResolveModal();
                closeBlockModal();
                closeBulkModal();
                closeSuccessModal();
            }
        });
    });
}

function setupRealtimeSubscription() {
    // Listen for new reports
    const reportsChannel = sb
        .channel('admin-reports')
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'message_reports'
            },
            () => {
                loadStats();
                showToast('New message report received');
                if (currentPage === 1) {
                    loadReports(true);
                }
            }
        )
        .subscribe();
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Make functions globally available
window.viewReport = viewReport;
window.viewMessageContext = viewMessageContext;
window.viewUser = viewUser;
window.showResolveModal = showResolveModal;
window.confirmResolve = confirmResolve;
window.dismissReport = dismissReport;
window.showBlockModal = showBlockModal;
window.confirmBlock = confirmBlock;
window.sendWarning = sendWarning;
window.toggleReportSelection = toggleReportSelection;
window.bulkAction = bulkAction;
window.exportReports = exportReports;
window.applyFilters = applyFilters;
window.resetFilters = resetFilters;
window.loadMoreReports = loadMoreReports;
window.setPriorityFilter = setPriorityFilter;
window.closeReportModal = closeReportModal;
window.closeMessageModal = closeMessageModal;
window.closeUserModal = closeUserModal;
window.closeResolveModal = closeResolveModal;
window.closeBlockModal = closeBlockModal;
window.closeBulkModal = closeBulkModal;
window.closeSuccessModal = closeSuccessModal;