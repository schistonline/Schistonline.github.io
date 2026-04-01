// ============================================
// NEW MESSAGE PAGE - FIND USERS AND CONTEXTS
// ============================================

const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentTab = 'direct';
let searchTimeout;

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    setupEventListeners();
    loadDirectUsers();
});

async function checkAuth() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
        window.location.href = 'login.html?redirect=new-message.html';
        return;
    }
    currentUser = user;
}

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            currentTab = btn.dataset.tab;
            
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(`tab-${currentTab}`).classList.add('active');
            
            // Load appropriate content
            switch(currentTab) {
                case 'direct': loadDirectUsers(); break;
                case 'inquiry': loadInquiries(); break;
                case 'quote': loadQuotes(); break;
                case 'order': loadOrders(); break;
            }
        });
    });

    // User search
    const userSearch = document.getElementById('userSearch');
    if (userSearch) {
        userSearch.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                loadDirectUsers(e.target.value);
            }, 500);
        });
    }

    // User filters
    document.querySelectorAll('[data-filter]').forEach(filter => {
        filter.addEventListener('click', function() {
            document.querySelectorAll('[data-filter]').forEach(f => f.classList.remove('active'));
            this.classList.add('active');
            loadDirectUsers(document.getElementById('userSearch')?.value);
        });
    });

    // Inquiry search
    document.getElementById('inquirySearch')?.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            loadInquiries(e.target.value);
        }, 500);
    });

    // Quote search
    document.getElementById('quoteSearch')?.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            loadQuotes(e.target.value);
        }, 500);
    });

    // Order search
    document.getElementById('orderSearch')?.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            loadOrders(e.target.value);
        }, 500);
    });
}

// ============================================
// LOAD DIRECT MESSAGE USERS
// ============================================
async function loadDirectUsers(search = '') {
    const container = document.getElementById('userResults');
    container.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Loading users...</p></div>';

    try {
        const filter = document.querySelector('[data-filter].active')?.dataset.filter || 'all';
        
        let query = sb
            .from('profiles')
            .select(`
                *,
                suppliers!suppliers_profile_id_fkey (
                    business_name,
                    verification_status,
                    business_type
                )
            `)
            .neq('id', currentUser.id);

        // Apply search
        if (search) {
            query = query.or(`full_name.ilike.%${search}%,business_name.ilike.%${search}%`);
        }

        // Apply filters
        if (filter === 'buyers') {
            query = query.eq('is_buyer', true);
        } else if (filter === 'suppliers') {
            query = query.eq('is_supplier', true);
        } else if (filter === 'verified') {
            query = query.eq('is_verified', true);
        }

        const { data, error } = await query.limit(50);
        
        if (error) throw error;

        if (!data || data.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users"></i>
                    <h3>No users found</h3>
                    <p>Try adjusting your search or filters</p>
                </div>
            `;
            return;
        }

        container.innerHTML = data.map(user => {
            const name = user.business_name || user.full_name || 'User';
            const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            const supplier = user.suppliers?.[0];
            
            return `
                <div class="result-card" onclick="startDirectChat('${user.id}')">
                    <div class="result-header">
                        <div class="result-avatar">
                            ${user.avatar_url ? 
                                `<img src="${user.avatar_url}" alt="${name}">` : 
                                initials
                            }
                        </div>
                        <div class="result-info">
                            <div class="result-name">
                                ${escapeHtml(name)}
                                ${user.is_verified ? '<i class="fas fa-check-circle verified-badge"></i>' : ''}
                            </div>
                            <div class="result-meta">
                                ${user.is_supplier ? '<span><i class="fas fa-warehouse"></i> Supplier</span>' : ''}
                                ${user.is_buyer ? '<span><i class="fas fa-shopping-cart"></i> Buyer</span>' : ''}
                            </div>
                        </div>
                    </div>
                    ${supplier ? `
                        <div class="result-details">
                            <div class="detail-item">
                                <i class="fas fa-building"></i>
                                <span>${escapeHtml(supplier.business_name || '')}</span>
                            </div>
                            <div class="detail-item">
                                <i class="fas fa-shield-alt"></i>
                                <span>${supplier.verification_status === 'verified' ? 'Verified Supplier' : 'Supplier'}</span>
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading users:', error);
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Error loading users</h3>
                <p>Please try again</p>
            </div>
        `;
    }
}

// ============================================
// LOAD INQUIRIES
// ============================================
async function loadInquiries(search = '') {
    const container = document.getElementById('inquiryResults');
    container.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Loading inquiries...</p></div>';

    try {
        let query = sb
            .from('inquiry_requests')
            .select(`
                *,
                profiles!inquiry_requests_buyer_id_fkey (
                    full_name,
                    business_name,
                    avatar_url,
                    is_verified
                ),
                inquiry_items (*)
            `)
            .eq('buyer_id', currentUser.id)
            .in('status', ['sent', 'partially_quoted', 'fully_quoted']);

        if (search) {
            query = query.or(`title.ilike.%${search}%,inquiry_number.ilike.%${search}%`);
        }

        const { data, error } = await query.order('created_at', { ascending: false }).limit(20);
        
        if (error) throw error;

        if (!data || data.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-file-invoice"></i>
                    <h3>No active inquiries</h3>
                    <p>Create a new inquiry to start chatting with suppliers</p>
                </div>
            `;
            return;
        }

        container.innerHTML = data.map(inquiry => {
            const itemCount = inquiry.inquiry_items?.length || 0;
            
            return `
                <div class="result-card" onclick="startInquiryChat(${inquiry.id})">
                    <div class="result-header">
                        <div class="result-info">
                            <div class="result-name">${escapeHtml(inquiry.title || 'Untitled Inquiry')}</div>
                            <div class="result-meta">
                                <span><i class="fas fa-hashtag"></i> ${inquiry.inquiry_number}</span>
                                <span><i class="fas fa-boxes"></i> ${itemCount} item${itemCount !== 1 ? 's' : ''}</span>
                            </div>
                        </div>
                    </div>
                    <div class="result-details">
                        <div class="detail-item">
                            <i class="fas fa-calendar"></i>
                            <span>Sent: ${formatDate(inquiry.created_at)}</span>
                        </div>
                        <div class="detail-item">
                            <i class="fas fa-hourglass-half"></i>
                            <span>Status: ${inquiry.status.replace('_', ' ')}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading inquiries:', error);
        container.innerHTML = '<div class="empty-state">Error loading inquiries</div>';
    }
}

// ============================================
// LOAD QUOTES
// ============================================
async function loadQuotes(search = '') {
    const container = document.getElementById('quoteResults');
    container.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Loading quotes...</p></div>';

    try {
        let query = sb
            .from('supplier_quotes')
            .select(`
                *,
                suppliers!inner (
                    business_name,
                    verification_status
                ),
                inquiry_requests!inner (
                    title,
                    inquiry_number
                )
            `)
            .in('status', ['sent', 'countered']);

        if (search) {
            query = query.ilike('quote_number', `%${search}%`);
        }

        const { data, error } = await query.order('created_at', { ascending: false }).limit(20);
        
        if (error) throw error;

        if (!data || data.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-file-invoice"></i>
                    <h3>No active quotes</h3>
                    <p>Quotes from suppliers will appear here</p>
                </div>
            `;
            return;
        }

        container.innerHTML = data.map(quote => {
            return `
                <div class="result-card" onclick="startQuoteChat(${quote.id})">
                    <div class="result-header">
                        <div class="result-info">
                            <div class="result-name">Quote from ${escapeHtml(quote.suppliers?.business_name || 'Supplier')}</div>
                            <div class="result-meta">
                                <span><i class="fas fa-hashtag"></i> ${quote.quote_number}</span>
                                <span><i class="fas fa-tag"></i> UGX ${formatNumber(quote.total_amount)}</span>
                            </div>
                        </div>
                    </div>
                    <div class="result-details">
                        <div class="detail-item">
                            <i class="fas fa-file-invoice"></i>
                            <span>Inquiry: ${escapeHtml(quote.inquiry_requests?.title || '')}</span>
                        </div>
                        <div class="detail-item">
                            <i class="fas fa-clock"></i>
                            <span>Valid until: ${formatDate(quote.valid_until)}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading quotes:', error);
        container.innerHTML = '<div class="empty-state">Error loading quotes</div>';
    }
}

// ============================================
// LOAD ORDERS
// ============================================
async function loadOrders(search = '') {
    const container = document.getElementById('orderResults');
    container.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Loading orders...</p></div>';

    try {
        let query = sb
            .from('orders')
            .select(`
                *,
                buyer:profiles!orders_buyer_id_fkey (
                    full_name,
                    business_name
                ),
                supplier:suppliers!orders_supplier_id_fkey (
                    business_name
                )
            `)
            .or(`buyer_id.eq.${currentUser.id},supplier_id.eq.${currentUser.id}`)
            .in('status', ['pending', 'confirmed', 'processing', 'shipped']);

        if (search) {
            query = query.ilike('order_number', `%${search}%`);
        }

        const { data, error } = await query.order('created_at', { ascending: false }).limit(20);
        
        if (error) throw error;

        if (!data || data.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-clipboard-list"></i>
                    <h3>No active orders</h3>
                    <p>Orders that need discussion will appear here</p>
                </div>
            `;
            return;
        }

        container.innerHTML = data.map(order => {
            const party = currentUser.id === order.buyer_id ? 
                order.supplier?.business_name : 
                order.buyer?.business_name || order.buyer?.full_name;
            
            return `
                <div class="result-card" onclick="startOrderChat(${order.id})">
                    <div class="result-header">
                        <div class="result-info">
                            <div class="result-name">Order #${order.order_number}</div>
                            <div class="result-meta">
                                <span><i class="fas ${currentUser.id === order.buyer_id ? 'fa-warehouse' : 'fa-user'}"></i> 
                                    ${escapeHtml(party || '')}
                                </span>
                                <span><i class="fas fa-tag"></i> UGX ${formatNumber(order.total_amount)}</span>
                            </div>
                        </div>
                    </div>
                    <div class="result-details">
                        <div class="detail-item">
                            <i class="fas fa-clock"></i>
                            <span>Status: ${order.status}</span>
                        </div>
                        <div class="detail-item">
                            <i class="fas fa-calendar"></i>
                            <span>Placed: ${formatDate(order.created_at)}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading orders:', error);
        container.innerHTML = '<div class="empty-state">Error loading orders</div>';
    }
}

// ============================================
// CHAT START FUNCTIONS
// ============================================
window.startDirectChat = function(userId) {
    window.location.href = `chat.html?user=${userId}`;
};

window.startInquiryChat = function(inquiryId) {
    window.location.href = `chat.html?inquiry=${inquiryId}`;
};

window.startQuoteChat = function(quoteId) {
    window.location.href = `chat.html?quote=${quoteId}`;
};

window.startOrderChat = function(orderId) {
    window.location.href = `chat.html?order=${orderId}`;
};

// ============================================
// UTILITY FUNCTIONS
// ============================================
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatNumber(num) {
    if (!num) return '0';
    return num.toLocaleString('en-UG');
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}