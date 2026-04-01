// ============================================
// LOGISTICS PROVIDER DASHBOARD
// ============================================

// Supabase Configuration
const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
let currentProvider = null;
let currentTab = 'pending';
let allRequests = [];
let myQuotes = [];
let activeShipments = [];
let completedShipments = [];
let notifications = [];
let chart = null;
let currentPage = 1;
let itemsPerPage = 10;
let totalItems = 0;
let currentRequestId = null;

// ============================================
// INITIALIZATION
//=============================================
document.addEventListener('DOMContentLoaded', async function() {
    showLoading();
    await checkAuth();
    await loadProviderData();
    await loadDashboardData();
    setupEventListeners();
    startRealTimeUpdates();
    updateDateTime();
    setInterval(updateDateTime, 1000);
    hideLoading();
});

// ============================================
// AUTHENTICATION
// ============================================
async function checkAuth() {
    try {
        const { data: { session }, error } = await sb.auth.getSession();
        
        if (error || !session) {
            window.location.href = 'logistics-login.html';
            return;
        }
        
        // Get provider details
        const { data: provider, error: providerError } = await sb
            .from('logistics_providers')
            .select('*')
            .eq('profile_id', session.user.id)
            .single();
        
        if (providerError || !provider) {
            throw new Error('Provider not found');
        }
        
        currentProvider = provider;
        
        // Update UI with provider info
        document.getElementById('companyName').textContent = provider.company_name;
        document.getElementById('companyLogo').textContent = provider.company_name.charAt(0);
        document.getElementById('providerInfo').textContent = 
            `Provider Code: ${provider.provider_code} • Member since ${new Date(provider.created_at).getFullYear()}`;
        document.getElementById('welcomeName').textContent = provider.company_name.split(' ')[0];
        
        // Update status badge
        updateStatusBadge(provider.is_active);
        
    } catch (error) {
        console.error('Auth error:', error);
        showAlert('Authentication failed. Please login again.', 'error');
        setTimeout(() => {
            window.location.href = 'logistics-login.html';
        }, 2000);
    }
}

function updateStatusBadge(isActive) {
    const badge = document.getElementById('statusBadge');
    if (isActive) {
        badge.className = 'status-badge';
        badge.innerHTML = '<i class="fas fa-circle"></i><span>Online - Accepting Orders</span>';
    } else {
        badge.className = 'status-badge offline';
        badge.innerHTML = '<i class="fas fa-circle"></i><span>Offline - Not Accepting Orders</span>';
    }
}

// ============================================
// LOAD DATA
// ============================================
async function loadProviderData() {
    // Load any provider-specific data
}

async function loadDashboardData() {
    try {
        await Promise.all([
            loadPendingRequests(),
            loadMyQuotes(),
            loadActiveShipments(),
            loadCompletedShipments(),
            loadNotifications(),
            loadStats()
        ]);
        
        updateChart();
        updateTimeline();
        
    } catch (error) {
        console.error('Error loading dashboard data:', error);
        showAlert('Failed to load dashboard data', 'error');
    }
}

async function loadPendingRequests() {
    try {
        const { data, error, count } = await sb
            .from('shipment_requests')
            .select(`
                *,
                quotes:shipment_quotes(*)
            `, { count: 'exact' })
            .eq('status', 'quoting')
            .order('created_at', { ascending: false })
            .range((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage - 1);
        
        if (error) throw error;
        
        // Filter out requests where provider already quoted
        allRequests = (data || []).filter(req => {
            const hasQuote = req.quotes?.some(q => q.provider_id === currentProvider?.id);
            return !hasQuote;
        });
        
        totalItems = count || 0;
        
        if (currentTab === 'pending') {
            displayRequests(allRequests);
        }
        
        updatePagination();
        
    } catch (error) {
        console.error('Error loading pending requests:', error);
    }
}

async function loadMyQuotes() {
    try {
        const { data, error } = await sb
            .from('shipment_quotes')
            .select(`
                *,
                request:shipment_requests (*)
            `)
            .eq('provider_id', currentProvider?.id)
            .in('status', ['pending', 'accepted'])
            .order('created_at', { ascending: false });
        
        if (!error) {
            myQuotes = data || [];
            
            if (currentTab === 'quoted') {
                displayQuotes(myQuotes);
            }
        }
        
    } catch (error) {
        console.error('Error loading quotes:', error);
    }
}

async function loadActiveShipments() {
    try {
        const { data, error } = await sb
            .from('shipment_quotes')
            .select(`
                *,
                request:shipment_requests (*)
            `)
            .eq('provider_id', currentProvider?.id)
            .eq('status', 'accepted')
            .in('request.status', ['in_transit', 'accepted'])
            .order('created_at', { ascending: false });
        
        if (!error) {
            activeShipments = data || [];
            
            if (currentTab === 'active') {
                displayActiveShipments(activeShipments);
            }
        }
        
    } catch (error) {
        console.error('Error loading active shipments:', error);
    }
}

async function loadCompletedShipments() {
    try {
        const { data, error } = await sb
            .from('shipment_quotes')
            .select(`
                *,
                request:shipment_requests (*)
            `)
            .eq('provider_id', currentProvider?.id)
            .eq('status', 'accepted')
            .eq('request.status', 'delivered')
            .order('created_at', { ascending: false });
        
        if (!error) {
            completedShipments = data || [];
            
            if (currentTab === 'completed') {
                displayCompletedShipments(completedShipments);
            }
        }
        
    } catch (error) {
        console.error('Error loading completed shipments:', error);
    }
}

async function loadNotifications() {
    try {
        // Get recent notifications
        const { data, error } = await sb
            .from('notifications')
            .select('*')
            .eq('user_id', currentProvider?.profile_id)
            .order('created_at', { ascending: false })
            .limit(20);
        
        if (!error) {
            notifications = data || [];
            updateNotificationBadge();
            displayNotifications();
        }
        
    } catch (error) {
        console.error('Error loading notifications:', error);
    }
}

async function loadStats() {
    try {
        // Pending count
        document.getElementById('statPending').textContent = allRequests.length;
        
        // Quotes count
        document.getElementById('statQuoted').textContent = myQuotes.length;
        
        // Active jobs
        document.getElementById('statActive').textContent = activeShipments.length;
        
        // Completed
        document.getElementById('statCompleted').textContent = completedShipments.length;
        
        // Calculate revenue
        const revenue = completedShipments.reduce((sum, q) => sum + (q.quoted_amount || 0), 0);
        document.getElementById('statRevenue').textContent = formatMoney(revenue);
        
        // Calculate rating (mock data for now)
        document.getElementById('statRating').textContent = '4.5';
        document.getElementById('ratingChange').innerHTML = '<span>12</span> reviews';
        
        // Update welcome banner
        document.getElementById('pendingRequestsCount').textContent = allRequests.length;
        
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// ============================================
// DISPLAY FUNCTIONS
// ============================================
function displayRequests(requests) {
    const tbody = document.getElementById('tableBody');
    
    if (!requests || requests.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 40px;">
                    <i class="fas fa-inbox" style="font-size: 40px; color: #9ca3af; margin-bottom: 15px;"></i>
                    <p style="color: #6b7280;">No pending requests found</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = requests.map(req => `
        <tr class="${isUrgent(req) ? 'priority-high' : ''}">
            <td><strong>${req.request_number || 'N/A'}</strong></td>
            <td>${req.origin_location || 'Unknown'} → ${req.destination_location || 'Unknown'}</td>
            <td>${req.estimated_weight_kg || '?'} kg</td>
            <td>${truncateText(req.item_description, 30) || 'N/A'}</td>
            <td>${formatDate(req.requested_pickup_date) || 'ASAP'}</td>
            <td>
                <span class="status status-pending">Pending</span>
            </td>
            <td>
                <button class="action-btn quote" onclick="openQuoteModal('${req.id}')">
                    <i class="fas fa-tag"></i> Quote
                </button>
                <button class="action-btn contact" onclick="contactBuyer('${req.buyer_id}')">
                    <i class="fab fa-whatsapp"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function displayQuotes(quotes) {
    const tbody = document.getElementById('tableBody');
    
    if (!quotes || quotes.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 40px;">
                    <i class="fas fa-file-invoice" style="font-size: 40px; color: #9ca3af; margin-bottom: 15px;"></i>
                    <p style="color: #6b7280;">No quotes submitted yet</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = quotes.map(quote => `
        <tr>
            <td><strong>${quote.request?.request_number || 'N/A'}</strong></td>
            <td>${quote.request?.origin_location || '?'} → ${quote.request?.destination_location || '?'}</td>
            <td>${formatMoney(quote.quoted_amount)} UGX</td>
            <td>${quote.estimated_days || '?'} days</td>
            <td>${quote.service_type || 'standard'}</td>
            <td>
                <span class="status status-${quote.status}">${quote.status}</span>
            </td>
            <td>
                <button class="action-btn view" onclick="viewQuoteDetails('${quote.id}')">
                    <i class="fas fa-eye"></i>
                </button>
                ${quote.status === 'pending' ? `
                    <button class="action-btn quote" onclick="editQuote('${quote.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                ` : ''}
            </td>
        </tr>
    `).join('');
}

function displayActiveShipments(shipments) {
    const tbody = document.getElementById('tableBody');
    
    if (!shipments || shipments.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 40px;">
                    <i class="fas fa-truck" style="font-size: 40px; color: #9ca3af; margin-bottom: 15px;"></i>
                    <p style="color: #6b7280;">No active shipments</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = shipments.map(shipment => `
        <tr>
            <td><strong>${shipment.request?.request_number || 'N/A'}</strong></td>
            <td>${shipment.request?.origin_location || '?'} → ${shipment.request?.destination_location || '?'}</td>
            <td>${shipment.request?.estimated_weight_kg || '?'} kg</td>
            <td>${shipment.tracking_number || 'Not assigned'}</td>
            <td>${shipment.request?.requested_delivery_date ? formatDate(shipment.request.requested_delivery_date) : 'TBD'}</td>
            <td>
                <span class="status status-in_transit">In Transit</span>
            </td>
            <td>
                <button class="action-btn view" onclick="updateTracking('${shipment.id}')">
                    <i class="fas fa-map-marker-alt"></i> Update
                </button>
            </td>
        </tr>
    `).join('');
}

function displayCompletedShipments(shipments) {
    const tbody = document.getElementById('tableBody');
    
    if (!shipments || shipments.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 40px;">
                    <i class="fas fa-check-circle" style="font-size: 40px; color: #9ca3af; margin-bottom: 15px;"></i>
                    <p style="color: #6b7280;">No completed shipments</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = shipments.map(shipment => `
        <tr>
            <td><strong>${shipment.request?.request_number || 'N/A'}</strong></td>
            <td>${shipment.request?.origin_location || '?'} → ${shipment.request?.destination_location || '?'}</td>
            <td>${formatMoney(shipment.quoted_amount)} UGX</td>
            <td>${shipment.estimated_days || '?'} days</td>
            <td>${formatDate(shipment.request?.delivered_at) || formatDate(shipment.updated_at)}</td>
            <td>
                <span class="status status-delivered">Delivered</span>
            </td>
            <td>
                <button class="action-btn view" onclick="viewInvoice('${shipment.id}')">
                    <i class="fas fa-file-invoice"></i> Invoice
                </button>
            </td>
        </tr>
    `).join('');
}

function displayNotifications() {
    const list = document.getElementById('notificationList');
    const unread = notifications.filter(n => !n.is_read).length;
    
    document.getElementById('notificationCount').textContent = unread;
    
    if (notifications.length === 0) {
        list.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 20px;">No notifications</p>';
        return;
    }
    
    list.innerHTML = notifications.map(n => `
        <div class="notification-item ${n.is_read ? '' : 'unread'}" onclick="markAsRead('${n.id}')">
            <div class="notification-title">${n.title || 'Notification'}</div>
            <div class="notification-message">${n.message || ''}</div>
            <div class="notification-time">${timeAgo(n.created_at)}</div>
        </div>
    `).join('');
}

function updateTimeline() {
    const timeline = document.getElementById('timelineContainer');
    
    // Combine recent activities from different sources
    const activities = [
        ...allRequests.slice(0, 3).map(r => ({
            type: 'request',
            title: 'New shipping request',
            description: `${r.request_number} - ${r.origin_location} → ${r.destination_location}`,
            time: r.created_at,
            icon: 'fa-inbox'
        })),
        ...myQuotes.slice(0, 3).map(q => ({
            type: 'quote',
            title: 'Quote submitted',
            description: `${q.request?.request_number} - ${formatMoney(q.quoted_amount)} UGX`,
            time: q.created_at,
            icon: 'fa-file-invoice',
            status: q.status
        })),
        ...activeShipments.slice(0, 3).map(s => ({
            type: 'shipment',
            title: 'Shipment in transit',
            description: `${s.request?.request_number} - On the way`,
            time: s.updated_at,
            icon: 'fa-truck',
            status: 'success'
        }))
    ].sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 5);
    
    if (activities.length === 0) {
        timeline.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 20px;">No recent activity</p>';
        return;
    }
    
    timeline.innerHTML = activities.map(act => `
        <div class="timeline-item">
            <div class="timeline-icon ${act.status || ''}">
                <i class="fas ${act.icon}"></i>
            </div>
            <div class="timeline-content">
                <div class="timeline-title">${act.title}</div>
                <div class="timeline-description">${act.description}</div>
                <div class="timeline-time">${timeAgo(act.time)}</div>
            </div>
        </div>
    `).join('');
}

// ============================================
// QUOTE MODAL FUNCTIONS
// ============================================
function openQuoteModal(requestId) {
    const request = allRequests.find(r => r.id === requestId);
    if (!request) return;
    
    currentRequestId = requestId;
    
    document.getElementById('modalRequestNumber').textContent = request.request_number || 'N/A';
    document.getElementById('modalRoute').textContent = `${request.origin_location || '?'} → ${request.destination_location || '?'}`;
    document.getElementById('modalWeight').textContent = `${request.estimated_weight_kg || '?'} kg`;
    document.getElementById('modalItems').textContent = request.item_description || 'N/A';
    
    // Set default valid until date (7 days from now)
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 7);
    document.getElementById('validUntil').value = validUntil.toISOString().split('T')[0];
    
    document.getElementById('quoteModal').classList.add('show');
}

function closeModal() {
    document.getElementById('quoteModal').classList.remove('show');
    document.getElementById('quoteForm').reset();
    currentRequestId = null;
}

async function submitQuote() {
    const amount = document.getElementById('quoteAmount').value;
    const days = document.getElementById('estimatedDays').value;
    const serviceType = document.getElementById('serviceType').value;
    const notes = document.getElementById('quoteNotes').value;
    const validUntil = document.getElementById('validUntil').value;
    
    if (!amount || !days) {
        showAlert('Please enter amount and delivery days', 'warning');
        return;
    }
    
    const submitBtn = document.getElementById('submitQuoteBtn');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
    submitBtn.disabled = true;
    
    try {
        // Check if quote already exists
        const { data: existingQuote } = await sb
            .from('shipment_quotes')
            .select('id')
            .eq('request_id', currentRequestId)
            .eq('provider_id', currentProvider.id)
            .single();
        
        let error;
        
        if (existingQuote) {
            // Update existing quote
            const { error: updateError } = await sb
                .from('shipment_quotes')
                .update({
                    quoted_amount: amount,
                    estimated_days: days,
                    service_type: serviceType,
                    notes: notes,
                    valid_until: validUntil || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                    status: 'pending',
                    updated_at: new Date().toISOString()
                })
                .eq('id', existingQuote.id);
            
            error = updateError;
        } else {
            // Insert new quote
            const { error: insertError } = await sb
                .from('shipment_quotes')
                .insert({
                    request_id: currentRequestId,
                    provider_id: currentProvider.id,
                    quoted_amount: amount,
                    estimated_days: days,
                    service_type: serviceType,
                    notes: notes,
                    valid_until: validUntil || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                    status: 'pending',
                    created_at: new Date().toISOString()
                });
            
            error = insertError;
        }
        
        if (error) throw error;
        
        showAlert('Quote submitted successfully!', 'success');
        closeModal();
        await loadDashboardData();
        
        // Create notification
        await createNotification(
            'Quote Submitted',
            `Your quote for request ${document.getElementById('modalRequestNumber').textContent} has been submitted`
        );
        
    } catch (error) {
        console.error('Error submitting quote:', error);
        showAlert('Failed to submit quote: ' + error.message, 'error');
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

// ============================================
// NOTIFICATION FUNCTIONS
// ============================================
async function createNotification(title, message) {
    try {
        await sb
            .from('notifications')
            .insert({
                user_id: currentProvider.profile_id,
                title: title,
                message: message,
                type: 'info',
                created_at: new Date().toISOString()
            });
    } catch (error) {
        console.error('Error creating notification:', error);
    }
}

function updateNotificationBadge() {
    const unread = notifications.filter(n => !n.is_read).length;
    document.getElementById('notificationCount').textContent = unread;
}

function toggleNotifications() {
    const panel = document.getElementById('notificationPanel');
    panel.classList.toggle('show');
}

async function markAsRead(notificationId) {
    try {
        await sb
            .from('notifications')
            .update({ is_read: true })
            .eq('id', notificationId);
        
        notifications = notifications.map(n => 
            n.id === notificationId ? { ...n, is_read: true } : n
        );
        
        updateNotificationBadge();
        displayNotifications();
        
    } catch (error) {
        console.error('Error marking notification as read:', error);
    }
}

async function markAllAsRead() {
    try {
        await sb
            .from('notifications')
            .update({ is_read: true })
            .eq('user_id', currentProvider.profile_id)
            .eq('is_read', false);
        
        notifications = notifications.map(n => ({ ...n, is_read: true }));
        updateNotificationBadge();
        displayNotifications();
        
    } catch (error) {
        console.error('Error marking all as read:', error);
    }
}

// ============================================
// COMMUNICATION FUNCTIONS
// ============================================
function openWhatsApp() {
    const phone = currentProvider?.phone || '256700000000';
    const message = encodeURIComponent(
        `Hello! This is ${currentProvider?.company_name}. How can we help with your shipment?`
    );
    window.open(`https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${message}`, '_blank');
}

function openMessenger() {
    window.open('https://m.me/iblueb2b', '_blank');
}

function openTelegram() {
    window.open('https://t.me/iblueb2b', '_blank');
}

function openEmail() {
    const email = currentProvider?.email || 'info@example.com';
    const subject = encodeURIComponent('Shipping Inquiry - iBlue B2B');
    const body = encodeURIComponent(
        `Dear ${currentProvider?.company_name},\n\nI need shipping services for my goods.\n\nRegards,\niBlue B2B Customer`
    );
    window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_blank');
}

function openSMS() {
    const phone = currentProvider?.phone || '+256700000000';
    const message = encodeURIComponent('Need shipping quotes. Please contact me.');
    window.open(`sms:${phone}?body=${message}`, '_blank');
}

function openInstagram() {
    window.open('https://instagram.com/iblueb2b', '_blank');
}

function openSignal() {
    const phone = currentProvider?.phone || '+256700000000';
    window.open(`https://signal.me/#p/${phone}`, '_blank');
}

function openWeChat() {
    alert('WeChat ID: iblueb2b');
}

function contactBuyer(buyerId) {
    const message = encodeURIComponent(
        `Hello! This is ${currentProvider?.company_name}. I'm interested in providing shipping for your goods. Let's discuss.`
    );
    window.open(`https://wa.me/256700000000?text=${message}`, '_blank');
}

// ============================================
// CHART FUNCTIONS
// ============================================
function updateChart() {
    const ctx = document.getElementById('ordersChart').getContext('2d');
    
    if (chart) {
        chart.destroy();
    }
    
    // Mock data - in production, fetch from database
    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            datasets: [{
                label: 'Quotes Submitted',
                data: [4, 6, 8, 12, 9, 5, 3],
                borderColor: '#0B4F6C',
                backgroundColor: 'rgba(11,79,108,0.1)',
                tension: 0.4,
                fill: true
            }, {
                label: 'Quotes Accepted',
                data: [2, 3, 5, 8, 6, 3, 2],
                borderColor: '#10b981',
                backgroundColor: 'rgba(16,185,129,0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0,0,0,0.05)'
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

function filterChart(period) {
    document.querySelectorAll('.chart-filter-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    // Update chart data based on period
    // This is mock data - in production, fetch from database
    if (period === 'week') {
        chart.data.labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        chart.data.datasets[0].data = [4, 6, 8, 12, 9, 5, 3];
        chart.data.datasets[1].data = [2, 3, 5, 8, 6, 3, 2];
    } else if (period === 'month') {
        chart.data.labels = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
        chart.data.datasets[0].data = [25, 32, 28, 35];
        chart.data.datasets[1].data = [18, 22, 20, 25];
    } else {
        chart.data.labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
        chart.data.datasets[0].data = [85, 95, 110, 125, 140, 155];
        chart.data.datasets[1].data = [60, 68, 75, 85, 95, 110];
    }
    chart.update();
}

// ============================================
// TAB SWITCHING
// ============================================
function switchTab(tab) {
    currentTab = tab;
    
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    
    const titles = {
        'pending': 'Pending Shipping Requests',
        'quoted': 'My Quotes',
        'active': 'Active Shipments',
        'completed': 'Completed Shipments',
        'rates': 'My Rates'
    };
    
    document.getElementById('tableTitle').textContent = titles[tab] || 'Requests';
    
    switch(tab) {
        case 'pending':
            displayRequests(allRequests);
            break;
        case 'quoted':
            displayQuotes(myQuotes);
            break;
        case 'active':
            displayActiveShipments(activeShipments);
            break;
        case 'completed':
            displayCompletedShipments(completedShipments);
            break;
        case 'rates':
            displayRates();
            break;
    }
}

function displayRates() {
    const tbody = document.getElementById('tableBody');
    
    tbody.innerHTML = `
        <tr>
            <td colspan="7" style="text-align: center; padding: 40px;">
                <i class="fas fa-tag" style="font-size: 40px; color: #9ca3af; margin-bottom: 15px;"></i>
                <p style="color: #6b7280;">Rate management coming soon</p>
                <button class="btn btn-primary" style="margin-top: 15px;" onclick="addRates()">
                    <i class="fas fa-plus"></i> Add Rates
                </button>
            </td>
        </tr>
    `;
}

// ============================================
// PAGINATION
// ============================================
function prevPage() {
    if (currentPage > 1) {
        currentPage--;
        loadDashboardData();
    }
}

function nextPage() {
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    if (currentPage < totalPages) {
        currentPage++;
        loadDashboardData();
    }
}

function updatePagination() {
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    
    document.getElementById('pageInfo').textContent = `Page ${currentPage} of ${totalPages || 1}`;
    document.getElementById('prevPageBtn').disabled = currentPage === 1;
    document.getElementById('nextPageBtn').disabled = currentPage === totalPages || totalPages === 0;
}

// ============================================
// PROFILE DROPDOWN
// ============================================
document.getElementById('profileDropdown').addEventListener('click', function(e) {
    e.stopPropagation();
    document.getElementById('dropdownMenu').classList.toggle('show');
});

document.addEventListener('click', function() {
    document.getElementById('dropdownMenu').classList.remove('show');
});

// ============================================
// NOTIFICATION BELL
// ============================================
document.getElementById('notificationBell').addEventListener('click', function(e) {
    e.stopPropagation();
    toggleNotifications();
});

// ============================================
// UTILITY FUNCTIONS
// ============================================
function isUrgent(request) {
    if (!request.requested_pickup_date) return false;
    const daysLeft = Math.ceil((new Date(request.requested_pickup_date) - new Date()) / (1000 * 60 * 60 * 24));
    return daysLeft <= 2;
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-UG', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
        });
    } catch {
        return 'Invalid Date';
    }
}

function formatMoney(amount) {
    return new Intl.NumberFormat('en-UG', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount || 0);
}

function timeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 7) {
        return formatDate(dateString);
    } else if (days > 0) {
        return `${days} day${days > 1 ? 's' : ''} ago`;
    } else if (hours > 0) {
        return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else if (minutes > 0) {
        return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    } else {
        return 'Just now';
    }
}

function truncateText(text, maxLength) {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

function updateDateTime() {
    const now = new Date();
    document.getElementById('currentDateTime').innerHTML = 
        `<i class="far fa-calendar"></i> ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
}

function showLoading() {
    document.getElementById('loadingOverlay').classList.add('show');
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.remove('show');
}

function showAlert(message, type = 'info') {
    // Simple alert for demo - in production, use toast
    alert(message);
}

// ============================================
// SEARCH AND FILTER
// ============================================
document.getElementById('searchInput')?.addEventListener('input', function(e) {
    const search = e.target.value.toLowerCase();
    
    if (currentTab === 'pending') {
        const filtered = allRequests.filter(req => 
            req.request_number?.toLowerCase().includes(search) ||
            req.item_description?.toLowerCase().includes(search) ||
            req.origin_location?.toLowerCase().includes(search) ||
            req.destination_location?.toLowerCase().includes(search)
        );
        displayRequests(filtered);
    }
});

document.getElementById('filterSelect')?.addEventListener('change', function(e) {
    const filter = e.target.value;
    
    if (currentTab === 'pending') {
        if (filter === 'high') {
            const filtered = allRequests.filter(req => isUrgent(req));
            displayRequests(filtered);
        } else {
            displayRequests(allRequests);
        }
    }
});

// ============================================
// REAL-TIME UPDATES
// ============================================
function startRealTimeUpdates() {
    // Subscribe to new requests
    const channel = sb
        .channel('provider-updates')
        .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'shipment_requests' },
            (payload) => {
                loadDashboardData();
                createNotification(
                    'New Shipping Request',
                    `Request ${payload.new.request_number} is available for quoting`
                );
            }
        )
        .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'shipment_quotes' },
            (payload) => {
                if (payload.new.provider_id === currentProvider?.id) {
                    loadDashboardData();
                    
                    if (payload.new.status === 'accepted') {
                        createNotification(
                            'Quote Accepted! 🎉',
                            `Your quote for request has been accepted`
                        );
                    }
                }
            }
        )
        .subscribe();
}

// ============================================
// NAVIGATION FUNCTIONS
// ============================================
function viewProfile() {
    window.location.href = 'logistics-profile.html';
}

function viewSettings() {
    window.location.href = 'logistics-settings.html';
}

function viewHelp() {
    window.location.href = 'logistics-help.html';
}

function viewAllActivity() {
    window.location.href = 'logistics-activity.html';
}

function addRates() {
    alert('Rate management coming soon!');
}

function viewQuoteDetails(quoteId) {
    alert('View quote details: ' + quoteId);
}

function editQuote(quoteId) {
    alert('Edit quote: ' + quoteId);
}

function updateTracking(shipmentId) {
    alert('Update tracking for shipment: ' + shipmentId);
}

function viewInvoice(shipmentId) {
    alert('View invoice for shipment: ' + shipmentId);
}

async function logout() {
    try {
        await sb.auth.signOut();
        window.location.href = 'logistics-login.html';
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// ============================================
// SETUP EVENT LISTENERS
// ============================================
function setupEventListeners() {
    // Click outside to close dropdowns
    document.addEventListener('click', function() {
        document.getElementById('dropdownMenu').classList.remove('show');
        document.getElementById('notificationPanel').classList.remove('show');
    });
}