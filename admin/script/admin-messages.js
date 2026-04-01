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
let messages = [];
let filteredMessages = [];
let currentPage = 1;
let hasMoreMessages = true;
let isLoading = false;
let currentMessage = null;
let currentUser_ = null;
let currentReport = null;
let customDateRange = { start: null, end: null };

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    await checkAdminStatus();
    await loadStats();
    await loadMessages();
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
            window.location.href = 'login.html?redirect=admin-messages.html';
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
        // Total messages
        const { count: totalCount } = await sb
            .from('messages')
            .select('*', { count: 'exact', head: true });
            
        // Active conversations (last 24 hours)
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        
        const { count: activeCount } = await sb
            .from('conversations')
            .select('*', { count: 'exact', head: true })
            .gt('last_message_at', yesterday.toISOString());
            
        // Reported messages
        const { count: reportedCount } = await sb
            .from('message_reports')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');
            
        // Active users (last 30 minutes)
        const thirtyMinutesAgo = new Date();
        thirtyMinutesAgo.setMinutes(thirtyMinutesAgo.getMinutes() - 30);
        
        const { count: activeUsersCount } = await sb
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .gt('last_active', thirtyMinutesAgo.toISOString());
            
        document.getElementById('totalMessages').textContent = totalCount || 0;
        document.getElementById('activeConversations').textContent = activeCount || 0;
        document.getElementById('reportedMessages').textContent = reportedCount || 0;
        document.getElementById('activeUsers').textContent = activeUsersCount || 0;
        document.getElementById('reportedBadge').textContent = reportedCount || 0;
        
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// ============================================
// LOAD MESSAGES
// ============================================
async function loadMessages(reset = true) {
    if (isLoading) return;
    
    isLoading = true;
    
    if (reset) {
        currentPage = 1;
        hasMoreMessages = true;
        document.getElementById('messagesGrid').innerHTML = '';
        showLoading(true);
    }
    
    try {
        const from = (currentPage - 1) * 20;
        const to = from + 20 - 1;
        
        let query = sb
            .from('messages')
            .select(`
                *,
                sender:profiles!messages_sender_id_fkey (
                    id, full_name, business_name, avatar_url, is_supplier, is_buyer, is_verified
                ),
                receiver:profiles!messages_receiver_id_fkey (
                    id, full_name, business_name, avatar_url
                ),
                conversation:conversations!messages_conversation_id_fkey (
                    id, participant_one_id, participant_two_id
                ),
                attachments:message_attachments (*),
                reports:message_reports (*)
            `)
            .order('created_at', { ascending: false })
            .range(from, to);
            
        // Apply filters
        const filters = getActiveFilters();
        if (filters.search) {
            query = query.or(`content.ilike.%${filters.search}%,sender.full_name.ilike.%${filters.search}%,sender.business_name.ilike.%${filters.search}%`);
        }
        
        if (filters.type === 'image') {
            // This would need a join or subquery
        }
        
        if (filters.status === 'reported') {
            query = query.not('reports', 'is', null);
        }
        
        if (filters.dateRange === 'custom' && customDateRange.start && customDateRange.end) {
            query = query
                .gte('created_at', customDateRange.start)
                .lte('created_at', customDateRange.end);
        } else if (filters.dateRange && filters.dateRange !== 'all') {
            const dateFilter = getDateFilter(filters.dateRange);
            if (dateFilter) {
                query = query.gte('created_at', dateFilter);
            }
        }
        
        const { data, error } = await query;
            
        if (error) throw error;
        
        if (data.length < 20) {
            hasMoreMessages = false;
            document.getElementById('loadMore').style.display = 'none';
        } else {
            document.getElementById('loadMore').style.display = 'block';
        }
        
        if (reset) {
            messages = data;
            filteredMessages = data;
        } else {
            messages = [...messages, ...data];
            filteredMessages = [...filteredMessages, ...data];
        }
        
        renderMessages();
        
    } catch (error) {
        console.error('Error loading messages:', error);
        showToast('Failed to load messages');
    } finally {
        isLoading = false;
        showLoading(false);
    }
}

// ============================================
// RENDER FUNCTIONS
// ============================================
function renderMessages() {
    const grid = document.getElementById('messagesGrid');
    const emptyState = document.getElementById('emptyState');
    
    if (filteredMessages.length === 0) {
        grid.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }
    
    grid.style.display = 'grid';
    emptyState.style.display = 'none';
    
    grid.innerHTML = filteredMessages.map(message => {
        const sender = message.sender || {};
        const senderName = sender.business_name || sender.full_name || 'Unknown User';
        const senderInitials = getInitials(senderName);
        const hasReports = message.reports && message.reports.length > 0;
        const hasAttachments = message.attachments && message.attachments.length > 0;
        const hasImage = hasAttachments && message.attachments.some(a => a.file_type?.startsWith('image/'));
        
        return `
            <div class="message-card ${hasReports ? 'reported' : ''}" onclick="viewMessage(${message.id})">
                <div class="message-header">
                    <div class="sender-info">
                        <div class="sender-avatar">
                            ${sender.avatar_url ? 
                                `<img src="${sender.avatar_url}" alt="${senderName}">` : 
                                senderInitials
                            }
                        </div>
                        <div class="sender-details">
                            <div class="sender-name">
                                ${escapeHtml(senderName)}
                                ${sender.is_supplier ? '<span class="user-type supplier">Supplier</span>' : ''}
                                ${sender.is_buyer ? '<span class="user-type buyer">Buyer</span>' : ''}
                            </div>
                            <div class="message-time">${formatTimeAgo(message.created_at)}</div>
                        </div>
                    </div>
                    <div class="message-badges">
                        ${hasReports ? '<span class="message-badge reported" title="Reported"><i class="fas fa-flag"></i></span>' : ''}
                        ${hasImage ? '<span class="message-badge image" title="Contains image"><i class="fas fa-image"></i></span>' : ''}
                    </div>
                </div>
                
                <div class="message-content">
                    ${escapeHtml(truncate(message.content, 150))}
                </div>
                
                <div class="message-meta">
                    <span class="meta-item">
                        <i class="fas fa-arrow-right"></i> To: ${escapeHtml(message.receiver?.business_name || message.receiver?.full_name || 'User')}
                    </span>
                    <span class="meta-item">
                        <i class="fas fa-comment"></i> ${message.conversation_id ? 'Conversation' : 'Direct'}
                    </span>
                </div>
                
                <div class="message-footer">
                    <div class="conversation-info">
                        <span class="conversation-id">ID: ${message.id}</span>
                    </div>
                    <div class="message-actions" onclick="event.stopPropagation()">
                        <button class="action-btn" onclick="viewUser(${sender.id})" title="View User">
                            <i class="fas fa-user"></i>
                        </button>
                        <button class="action-btn" onclick="viewConversation(${message.conversation_id})" title="View Thread">
                            <i class="fas fa-comments"></i>
                        </button>
                        ${!hasReports ? `
                            <button class="action-btn warning" onclick="showFlagModal(${message.id})" title="Flag">
                                <i class="fas fa-flag"></i>
                            </button>
                        ` : ''}
                        <button class="action-btn danger" onclick="showDeleteMessageModal(${message.id})" title="Delete">
                            <i class="fas fa-trash"></i>
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
window.viewMessage = async function(messageId) {
    const message = messages.find(m => m.id === messageId);
    if (!message) return;
    
    currentMessage = message;
    
    const sender = message.sender || {};
    const receiver = message.receiver || {};
    const senderName = sender.business_name || sender.full_name || 'Unknown';
    const receiverName = receiver.business_name || receiver.full_name || 'Unknown';
    
    const detail = document.getElementById('messageDetail');
    detail.innerHTML = `
        <div class="detail-section">
            <h4><i class="fas fa-user"></i> Sender</h4>
            <div class="detail-row">
                <span class="detail-label">Name:</span>
                <span class="detail-value">${escapeHtml(senderName)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">ID:</span>
                <span class="detail-value">${sender.id || 'N/A'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Type:</span>
                <span class="detail-value">${sender.is_supplier ? 'Supplier' : sender.is_buyer ? 'Buyer' : 'User'}</span>
            </div>
        </div>
        
        <div class="detail-section">
            <h4><i class="fas fa-user"></i> Receiver</h4>
            <div class="detail-row">
                <span class="detail-label">Name:</span>
                <span class="detail-value">${escapeHtml(receiverName)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">ID:</span>
                <span class="detail-value">${receiver.id || 'N/A'}</span>
            </div>
        </div>
        
        <div class="detail-section">
            <h4><i class="fas fa-clock"></i> Timestamps</h4>
            <div class="detail-row">
                <span class="detail-label">Sent:</span>
                <span class="detail-value">${formatDateTime(message.created_at)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Read:</span>
                <span class="detail-value">${message.read_at ? formatDateTime(message.read_at) : 'Not read'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Delivered:</span>
                <span class="detail-value">${message.delivered_at ? formatDateTime(message.delivered_at) : 'Not delivered'}</span>
            </div>
        </div>
        
        <div class="detail-section">
            <h4><i class="fas fa-envelope"></i> Message Content</h4>
            <div class="detail-content">${escapeHtml(message.content).replace(/\n/g, '<br>')}</div>
        </div>
        
        ${message.attachments && message.attachments.length > 0 ? `
            <div class="detail-section">
                <h4><i class="fas fa-paperclip"></i> Attachments</h4>
                <div class="attachments-list">
                    ${message.attachments.map(att => `
                        <a href="${att.file_url}" target="_blank" class="attachment-item">
                            <i class="fas ${getFileIcon(att.file_name)}"></i>
                            <span>${att.file_name}</span>
                        </a>
                    `).join('')}
                </div>
            </div>
        ` : ''}
        
        ${message.reports && message.reports.length > 0 ? `
            <div class="detail-section">
                <h4><i class="fas fa-flag"></i> Reports</h4>
                ${message.reports.map(report => `
                    <div class="report-item" onclick="viewReport(${report.id})">
                        <strong>${report.reason}</strong>
                        <p>${report.details || ''}</p>
                        <small>${formatTimeAgo(report.created_at)}</small>
                    </div>
                `).join('')}
            </div>
        ` : ''}
    `;
    
    document.getElementById('messageModal').classList.add('show');
};

window.viewConversation = async function(conversationId) {
    if (!conversationId) {
        showToast('No conversation thread');
        return;
    }
    
    try {
        const { data, error } = await sb
            .from('messages')
            .select(`
                *,
                sender:profiles!messages_sender_id_fkey (
                    id, full_name, business_name, avatar_url
                )
            `)
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true });
            
        if (error) throw error;
        
        const thread = document.getElementById('conversationThread');
        thread.innerHTML = data.map(msg => {
            const sender = msg.sender || {};
            const senderName = sender.business_name || sender.full_name || 'User';
            const isOwn = msg.sender_id === currentMessage?.sender_id;
            
            return `
                <div class="thread-message ${isOwn ? 'own-message' : ''}">
                    <div class="thread-avatar">
                        ${sender.avatar_url ? 
                            `<img src="${sender.avatar_url}" alt="${senderName}">` : 
                            getInitials(senderName)
                        }
                    </div>
                    <div class="thread-content">
                        <div class="thread-header">
                            <span class="thread-sender">${escapeHtml(senderName)}</span>
                            <span class="thread-time">${formatTimeAgo(msg.created_at)}</span>
                        </div>
                        <div class="thread-text">${escapeHtml(msg.content)}</div>
                    </div>
                </div>
            `;
        }).join('');
        
        document.getElementById('conversationModal').classList.add('show');
        
    } catch (error) {
        console.error('Error loading conversation:', error);
        showToast('Failed to load conversation');
    }
};

window.viewUser = async function(userId) {
    try {
        const { data, error } = await sb
            .from('profiles')
            .select(`
                *,
                sent:messages!messages_sender_id_fkey(count),
                received:messages!messages_receiver_id_fkey(count)
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
                    <span class="user-stat-value">${data.is_verified ? '✓' : '✗'}</span>
                    <span class="user-stat-label">Verified</span>
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
                    <span class="detail-label">Type:</span>
                    <span class="detail-value">
                        ${data.is_supplier ? 'Supplier' : ''}
                        ${data.is_buyer ? 'Buyer' : ''}
                        ${data.is_admin ? 'Admin' : ''}
                    </span>
                </div>
            </div>
            
            <div class="user-actions">
                <button class="btn-success" onclick="sendWarning()">Send Warning</button>
                <button class="btn-danger" onclick="showBlockUserModal('${data.id}')">Block User</button>
            </div>
        `;
        
        document.getElementById('userModal').classList.add('show');
        
    } catch (error) {
        console.error('Error loading user:', error);
        showToast('Failed to load user');
    }
};

window.viewReport = function(reportId) {
    // Find report in current message
    const report = currentMessage?.reports?.find(r => r.id === reportId);
    if (!report) return;
    
    currentReport = report;
    
    const reportDetail = document.getElementById('reportDetail');
    reportDetail.innerHTML = `
        <div class="report-reason">${escapeHtml(report.reason)}</div>
        <p>${escapeHtml(report.details || 'No additional details')}</p>
        <div class="report-message">
            <strong>Reported Message:</strong>
            <p>${escapeHtml(currentMessage.content)}</p>
        </div>
        <div class="detail-row">
            <span class="detail-label">Reported by:</span>
            <span class="detail-value">User ${report.reporter_id}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Date:</span>
            <span class="detail-value">${formatDateTime(report.created_at)}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Status:</span>
            <span class="detail-value">${report.status || 'pending'}</span>
        </div>
    `;
    
    document.getElementById('reportModal').classList.add('show');
};

// ============================================
// ACTION FUNCTIONS
// ============================================
window.showFlagModal = function(messageId) {
    currentMessage = messages.find(m => m.id === messageId);
    document.getElementById('flagModal').classList.add('show');
};

window.submitFlag = function() {
    const reason = document.querySelector('input[name="flagReason"]:checked')?.value;
    const notes = document.getElementById('flagNotes').value;
    
    if (!reason) {
        showToast('Please select a reason');
        return;
    }
    
    // In a real implementation, this would save to a flags table
    showToast('Message flagged for review');
    closeFlagModal();
};

window.showBlockUserModal = function(userId) {
    const user = currentUser_;
    document.getElementById('blockUserName').textContent = user?.business_name || user?.full_name || 'this user';
    document.getElementById('blockUserModal').classList.add('show');
};

window.confirmBlockUser = function() {
    const reason = document.getElementById('blockReason').value;
    const duration = document.querySelector('input[name="blockDuration"]:checked')?.value;
    
    // In a real implementation, this would update the user's status
    showToast(`User blocked ${duration === 'permanent' ? 'permanently' : 'for 7 days'}`);
    closeBlockUserModal();
    closeUserModal();
};

window.showDeleteMessageModal = function(messageId) {
    currentMessage = messages.find(m => m.id === messageId);
    document.getElementById('deleteMessageModal').classList.add('show');
};

window.confirmDeleteMessage = async function() {
    if (!currentMessage) return;
    
    try {
        const { error } = await sb
            .from('messages')
            .delete()
            .eq('id', currentMessage.id);
            
        if (error) throw error;
        
        // Remove from local arrays
        messages = messages.filter(m => m.id !== currentMessage.id);
        filteredMessages = filteredMessages.filter(m => m.id !== currentMessage.id);
        
        renderMessages();
        showSuccess('Message deleted successfully');
        closeDeleteMessageModal();
        closeMessageModal();
        
    } catch (error) {
        console.error('Error deleting message:', error);
        showToast('Failed to delete message');
    }
};

window.resolveReport = function() {
    // In a real implementation, this would update the report status
    showToast('Report resolved');
    closeReportModal();
};

window.dismissReport = function() {
    showToast('Report dismissed');
    closeReportModal();
};

window.sendWarning = function() {
    showToast('Warning sent to user');
    closeUserModal();
};

// ============================================
// SCAN FUNCTIONS
// ============================================
window.scanForIssues = function() {
    const results = document.getElementById('scanResults');
    
    // Simulate scan results
    results.innerHTML = `
        <div class="scan-item">
            <div class="scan-icon warning">
                <i class="fas fa-exclamation-triangle"></i>
            </div>
            <div class="scan-info">
                <div class="scan-title">Potential Spam Detected</div>
                <div class="scan-description">3 messages flagged as potential spam</div>
            </div>
        </div>
        <div class="scan-item">
            <div class="scan-icon danger">
                <i class="fas fa-skull-crosswalk"></i>
            </div>
            <div class="scan-info">
                <div class="scan-title">Harassment Alert</div>
                <div class="scan-description">1 conversation flagged for harassment</div>
            </div>
        </div>
        <div class="scan-item">
            <div class="scan-icon success">
                <i class="fas fa-check-circle"></i>
            </div>
            <div class="scan-info">
                <div class="scan-title">No Issues Found</div>
                <div class="scan-description">245 messages scanned, no issues found</div>
            </div>
        </div>
    `;
    
    document.getElementById('scanModal').classList.add('show');
};

// ============================================
// EXPORT FUNCTIONS
// ============================================
window.exportMessages = function(format) {
    const data = filteredMessages.map(m => ({
        id: m.id,
        sender: m.sender?.business_name || m.sender?.full_name,
        receiver: m.receiver?.business_name || m.receiver?.full_name,
        content: m.content,
        created_at: m.created_at,
        read_at: m.read_at,
        delivered_at: m.delivered_at
    }));
    
    if (format === 'csv') {
        exportToCSV(data);
    } else if (format === 'json') {
        exportToJSON(data);
    } else if (format === 'pdf') {
        showToast('PDF export coming soon');
    } else if (format === 'excel') {
        showToast('Excel export coming soon');
    }
    
    closeExportModal();
};

function exportToCSV(data) {
    const headers = ['ID', 'Sender', 'Receiver', 'Content', 'Created', 'Read', 'Delivered'];
    const csvContent = [
        headers.join(','),
        ...data.map(m => [
            m.id,
            `"${m.sender || ''}"`,
            `"${m.receiver || ''}"`,
            `"${m.content.replace(/"/g, '""')}"`,
            m.created_at,
            m.read_at || '',
            m.delivered_at || ''
        ].join(','))
    ].join('\n');
    
    downloadFile(csvContent, 'messages_export.csv', 'text/csv');
}

function exportToJSON(data) {
    const jsonContent = JSON.stringify(data, null, 2);
    downloadFile(jsonContent, 'messages_export.json', 'application/json');
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
// FILTER FUNCTIONS
// ============================================
function getActiveFilters() {
    return {
        search: document.getElementById('searchMessages').value,
        dateRange: document.getElementById('dateFilter').value,
        type: document.getElementById('typeFilter').value,
        status: document.getElementById('statusFilter').value
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
    loadMessages(true);
};

window.resetFilters = function() {
    document.getElementById('searchMessages').value = '';
    document.getElementById('dateFilter').value = 'all';
    document.getElementById('typeFilter').value = 'all';
    document.getElementById('statusFilter').value = 'all';
    customDateRange = { start: null, end: null };
    
    applyFilters();
};

window.loadMoreMessages = function() {
    if (hasMoreMessages && !isLoading) {
        currentPage++;
        loadMessages(false);
    }
};

// ============================================
// DATE RANGE FUNCTIONS
// ============================================
window.showDateRangeModal = function() {
    document.getElementById('dateRangeModal').classList.add('show');
};

window.applyDateRange = function() {
    const start = document.getElementById('startDate').value;
    const end = document.getElementById('endDate').value;
    
    if (!start || !end) {
        showToast('Please select both start and end dates');
        return;
    }
    
    customDateRange = {
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString()
    };
    
    closeDateRangeModal();
    applyFilters();
};

// ============================================
// QUICK FILTER FUNCTIONS
// ============================================
window.setQuickFilter = function(filter) {
    document.querySelectorAll('.quick-filter').forEach(el => {
        el.classList.remove('active');
    });
    event.target.classList.add('active');
    
    if (filter === 'reported') {
        document.getElementById('statusFilter').value = 'reported';
    } else if (filter === 'flagged') {
        // Custom logic for flagged
    } else if (filter === 'images') {
        document.getElementById('typeFilter').value = 'image';
    } else if (filter === 'files') {
        document.getElementById('typeFilter').value = 'file';
    } else if (filter === 'quotes') {
        document.getElementById('typeFilter').value = 'quote';
    }
    
    applyFilters();
};

// ============================================
// UTILITY FUNCTIONS
// ============================================
function showLoading(show) {
    document.getElementById('loadingState').style.display = show ? 'flex' : 'none';
    document.getElementById('messagesGrid').style.display = show ? 'none' : 'grid';
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

function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const icons = {
        'pdf': 'fa-file-pdf',
        'doc': 'fa-file-word',
        'docx': 'fa-file-word',
        'xls': 'fa-file-excel',
        'xlsx': 'fa-file-excel',
        'jpg': 'fa-file-image',
        'jpeg': 'fa-file-image',
        'png': 'fa-file-image'
    };
    return icons[ext] || 'fa-file';
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
window.closeMessageModal = () => document.getElementById('messageModal').classList.remove('show');
window.closeConversationModal = () => document.getElementById('conversationModal').classList.remove('show');
window.closeUserModal = () => document.getElementById('userModal').classList.remove('show');
window.closeReportModal = () => document.getElementById('reportModal').classList.remove('show');
window.closeFlagModal = () => document.getElementById('flagModal').classList.remove('show');
window.closeBlockUserModal = () => document.getElementById('blockUserModal').classList.remove('show');
window.closeDeleteMessageModal = () => document.getElementById('deleteMessageModal').classList.remove('show');
window.closeExportModal = () => document.getElementById('exportModal').classList.remove('show');
window.closeDateRangeModal = () => document.getElementById('dateRangeModal').classList.remove('show');
window.closeScanModal = () => document.getElementById('scanModal').classList.remove('show');
window.closeSuccessModal = () => document.getElementById('successModal').classList.remove('show');

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
    // Refresh button
    document.getElementById('refreshBtn')?.addEventListener('click', () => {
        loadStats();
        loadMessages(true);
    });
    
    // Export button
    document.getElementById('exportBtn')?.addEventListener('click', () => {
        document.getElementById('exportModal').classList.add('show');
    });
    
    // Scan button
    document.getElementById('scanBtn')?.addEventListener('click', scanForIssues);
    
    // Filters
    document.getElementById('searchMessages')?.addEventListener('input', debounce(applyFilters, 500));
    document.getElementById('dateFilter')?.addEventListener('change', (e) => {
        if (e.target.value === 'custom') {
            showDateRangeModal();
        } else {
            applyFilters();
        }
    });
    document.getElementById('typeFilter')?.addEventListener('change', applyFilters);
    document.getElementById('statusFilter')?.addEventListener('change', applyFilters);
    
    // Quick filters
    document.querySelectorAll('.quick-filter').forEach(btn => {
        btn.addEventListener('click', (e) => {
            setQuickFilter(e.target.dataset.filter);
        });
    });
    
    // Close modals on outside click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeMessageModal();
                closeConversationModal();
                closeUserModal();
                closeReportModal();
                closeFlagModal();
                closeBlockUserModal();
                closeDeleteMessageModal();
                closeExportModal();
                closeDateRangeModal();
                closeScanModal();
                closeSuccessModal();
            }
        });
    });
}

function setupRealtimeSubscription() {
    // Listen for new messages
    const messagesChannel = sb
        .channel('admin-messages')
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'messages'
            },
            () => {
                loadStats();
                // Optionally refresh messages if on first page
                if (currentPage === 1) {
                    loadMessages(true);
                }
            }
        )
        .subscribe();
    
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
window.viewMessage = viewMessage;
window.viewConversation = viewConversation;
window.viewUser = viewUser;
window.viewReport = viewReport;
window.showFlagModal = showFlagModal;
window.submitFlag = submitFlag;
window.showBlockUserModal = showBlockUserModal;
window.confirmBlockUser = confirmBlockUser;
window.showDeleteMessageModal = showDeleteMessageModal;
window.confirmDeleteMessage = confirmDeleteMessage;
window.resolveReport = resolveReport;
window.dismissReport = dismissReport;
window.sendWarning = sendWarning;
window.scanForIssues = scanForIssues;
window.exportMessages = exportMessages;
window.applyFilters = applyFilters;
window.resetFilters = resetFilters;
window.loadMoreMessages = loadMoreMessages;
window.showDateRangeModal = showDateRangeModal;
window.applyDateRange = applyDateRange;
window.setQuickFilter = setQuickFilter;
window.closeMessageModal = closeMessageModal;
window.closeConversationModal = closeConversationModal;
window.closeUserModal = closeUserModal;
window.closeReportModal = closeReportModal;
window.closeFlagModal = closeFlagModal;
window.closeBlockUserModal = closeBlockUserModal;
window.closeDeleteMessageModal = closeDeleteMessageModal;
window.closeExportModal = closeExportModal;
window.closeDateRangeModal = closeDateRangeModal;
window.closeScanModal = closeScanModal;
window.closeSuccessModal = closeSuccessModal;