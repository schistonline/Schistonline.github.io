// ========== ADMIN USERS JAVASCRIPT ==========
const userManager = (function() {
    // Supabase Configuration
    const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';
    
    const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // State
    let currentUser = null;
    let users = [];
    let currentFilter = 'all';
    let currentPage = 1;
    let itemsPerPage = 20;
    let totalUsers = 0;
    let searchTimeout = null;
    let selectedUserId = null;

    // ========== HELPER FUNCTIONS ==========
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = 'toast show ' + type;
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    function openModal(modalId) {
        document.getElementById(modalId).classList.add('show');
    }

    function closeModal(modalId) {
        document.getElementById(modalId).classList.remove('show');
    }

    function getSupplierStatusClass(status) {
        switch(status) {
            case 'verified': return 'status-verified';
            case 'pending': return 'status-pending';
            case 'rejected': return 'status-rejected';
            default: return '';
        }
    }

    // ========== AUTHENTICATION ==========
    async function checkAdminAuth() {
        try {
            const { data: { user }, error } = await sb.auth.getUser();
            
            if (error || !user) {
                window.location.href = 'admin-login.html?redirect=admin-users.html';
                return false;
            }
            
            const { data: profile, error: profileError } = await sb
                .from('profiles')
                .select('is_admin, admin_role, full_name, email')
                .eq('id', user.id)
                .single();
            
            if (profileError || !profile || !profile.is_admin) {
                window.location.href = 'index.html';
                return false;
            }
            
            currentUser = {
                ...user,
                ...profile
            };
            
            const adminInitials = document.getElementById('adminInitials');
            if (adminInitials && profile.full_name) {
                adminInitials.textContent = profile.full_name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
            }
            
            return true;
        } catch (error) {
            console.error('Auth check error:', error);
            window.location.href = 'admin-login.html';
            return false;
        }
    }

    // ========== LOAD USERS ==========
    async function loadUsers(page = 1, filters = {}) {
        const container = document.getElementById('usersList');
        
        try {
            let query = sb
                .from('profiles')
                .select(`
                    *,
                    suppliers!suppliers_profile_id_fkey (
                        id,
                        business_name,
                        verification_status,
                        business_type,
                        warehouse_district,
                        tax_id,
                        business_registration,
                        total_orders
                    )
                `, { count: 'exact' });
            
            if (filters.status === 'banned') {
                query = query.eq('is_banned', true);
            } else if (filters.status === 'active') {
                query = query.eq('is_banned', false);
            }
            
            if (filters.type && filters.type !== 'all') {
                if (filters.type === 'buyer') {
                    query = query.eq('is_buyer', true);
                } else if (filters.type === 'admin') {
                    query = query.eq('is_admin', true);
                } else if (filters.type === 'supplier') {
                    query = query.eq('is_supplier', true);
                }
            }
            
            if (filters.verification) {
                if (filters.verification === 'verified') {
                    query = query.eq('is_verified', true);
                } else if (filters.verification === 'unverified') {
                    query = query.eq('is_verified', false);
                }
            }
            
            if (filters.search) {
                query = query.or(`full_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,phone.ilike.%${filters.search}%`);
            }
            
            if (filters.startDate && filters.endDate) {
                query = query.gte('created_at', filters.startDate)
                             .lte('created_at', filters.endDate);
            }
            
            const from = (page - 1) * itemsPerPage;
            const to = from + itemsPerPage - 1;
            
            const { data, error, count } = await query
                .order('created_at', { ascending: false })
                .range(from, to);
            
            if (error) throw error;
            
            let filteredUsers = data || [];
            
            if (filters.verification === 'pending') {
                const { data: pendingSuppliers } = await sb
                    .from('suppliers')
                    .select('profile_id')
                    .eq('verification_status', 'pending');
                
                if (pendingSuppliers && pendingSuppliers.length > 0) {
                    const pendingIds = new Set(pendingSuppliers.map(ps => ps.profile_id));
                    filteredUsers = filteredUsers.filter(user => pendingIds.has(user.id));
                } else {
                    filteredUsers = [];
                }
            }
            
            users = filteredUsers;
            totalUsers = count || 0;
            
            renderUsers();
            updateStats();
            
        } catch (error) {
            console.error('Error loading users:', error);
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>Error loading users: ${error.message}</p>
                    <button class="btn btn-primary" onclick="userManager.loadUsers()" style="margin-top: 16px;">
                        <i class="fas fa-sync-alt"></i> Retry
                    </button>
                </div>
            `;
        }
    }

    // ========== UPDATE STATS ==========
    async function updateStats() {
        try {
            const { count: total } = await sb
                .from('profiles')
                .select('*', { count: 'exact', head: true });
            
            document.getElementById('totalUsers').textContent = total || 0;
            
            const { count: active } = await sb
                .from('profiles')
                .select('*', { count: 'exact', head: true })
                .eq('is_banned', false);
            
            document.getElementById('activeUsers').textContent = active || 0;
            
            const { count: banned } = await sb
                .from('profiles')
                .select('*', { count: 'exact', head: true })
                .eq('is_banned', true);
            
            document.getElementById('bannedUsers').textContent = banned || 0;
            
            const { count: suppliers } = await sb
                .from('suppliers')
                .select('*', { count: 'exact', head: true });
            
            document.getElementById('supplierCount').textContent = suppliers || 0;
            
        } catch (error) {
            console.error('Error updating stats:', error);
        }
    }

    // ========== RENDER USERS ==========
    function renderUsers() {
        const container = document.getElementById('usersList');
        
        if (users.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users-slash"></i>
                    <p>No users found matching your filters.</p>
                </div>
            `;
            return;
        }
        
        let html = '';
        users.forEach(user => {
            html += renderUserRow(user);
        });
        
        container.innerHTML = html;
        updatePagination();
    }

    function renderUserRow(user) {
        const supplier = user.suppliers && user.suppliers.length > 0 ? user.suppliers[0] : null;
        const initials = user.full_name
            ? user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)
            : user.email.substring(0, 2).toUpperCase();
        
        const badges = [];
        
        if (user.is_admin) {
            badges.push(`<span class="user-badge ${user.admin_role === 'super_admin' ? 'badge-super-admin' : 'badge-admin'}">${user.admin_role || 'Admin'}</span>`);
        }
        if (user.is_supplier) {
            badges.push('<span class="user-badge badge-supplier">Supplier</span>');
        }
        if (user.is_buyer) {
            badges.push('<span class="user-badge badge-buyer">Buyer</span>');
        }
        if (user.is_banned) {
            badges.push('<span class="user-badge badge-banned">Banned</span>');
        }
        
        return `
            <div class="user-row ${user.is_banned ? 'banned' : ''}" data-user-id="${user.id}">
                <div class="user-info">
                    <div class="user-avatar">
                        ${user.avatar_url ? 
                            `<img src="${user.avatar_url}" alt="${escapeHtml(user.full_name)}">` : 
                            `<span>${initials}</span>`
                        }
                        ${user.is_verified ? '<span class="verified-badge"><i class="fas fa-check"></i></span>' : ''}
                    </div>
                    <div class="user-details">
                        <div class="user-name">
                            ${escapeHtml(user.full_name || 'Unnamed User')}
                            <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                                ${badges.join(' ')}
                            </div>
                        </div>
                        <div class="user-email">${escapeHtml(user.email)}</div>
                    </div>
                </div>
                
                <div>
                    <div class="user-phone">${escapeHtml(user.phone || 'No phone')}</div>
                </div>
                
                <div>
                    <div class="user-location">
                        ${escapeHtml(user.district || user.location || 'Not specified')}
                    </div>
                </div>
                
                <div>
                    <div class="user-type">
                        ${user.is_supplier ? 'Supplier' : (user.is_buyer ? 'Buyer' : 'User')}
                    </div>
                </div>
                
                <div>
                    <div class="user-stats">
                        <div class="stat">
                            <div class="stat-value">${user.total_ads || 0}</div>
                            <div class="stat-label">Ads</div>
                        </div>
                    </div>
                </div>
                
                <div>
                    ${user.is_supplier && supplier ? `
                        <div class="supplier-status">
                            <span class="${getSupplierStatusClass(supplier.verification_status)}">
                                ${supplier.verification_status || 'Pending'}
                            </span>
                        </div>
                    ` : '<span class="supplier-status">-</span>'}
                </div>
                
                <div class="user-actions">
                    <button class="action-btn" onclick="userManager.viewUserDetails('${user.id}')" title="View Details">
                        <i class="fas fa-eye"></i>
                    </button>
                    
                    ${!user.is_banned ? `
                        <button class="action-btn warning" onclick="userManager.openBanModal('${user.id}', '${escapeHtml(user.full_name || user.email)}')" title="Ban User">
                            <i class="fas fa-ban"></i>
                        </button>
                    ` : `
                        <button class="action-btn success" onclick="userManager.unbanUser('${user.id}')" title="Unban User">
                            <i class="fas fa-check-circle"></i>
                        </button>
                    `}
                    
                    ${user.is_supplier && supplier && supplier.verification_status !== 'verified' ? `
                        <button class="action-btn success" onclick="userManager.openVerifyModal('${user.id}', '${supplier.id}')" title="Verify Supplier">
                            <i class="fas fa-check-double"></i>
                        </button>
                    ` : ''}
                    
                    ${!user.is_admin ? `
                        <button class="action-btn" onclick="userManager.openAdminRoleModal('${user.id}')" title="Make Admin">
                            <i class="fas fa-crown"></i>
                        </button>
                    ` : `
                        <button class="action-btn warning" onclick="userManager.openAdminRoleModal('${user.id}')" title="Manage Admin Role">
                            <i class="fas fa-user-cog"></i>
                        </button>
                    `}
                </div>
            </div>
        `;
    }

    // ========== PAGINATION ==========
    function updatePagination() {
        const totalPages = Math.ceil(totalUsers / itemsPerPage);
        
        document.getElementById('paginationInfo').textContent = 
            `Showing ${((currentPage - 1) * itemsPerPage) + 1} to ${Math.min(currentPage * itemsPerPage, totalUsers)} of ${totalUsers} users`;
        
        let controls = '';
        
        controls += `<button class="pagination-btn" onclick="userManager.changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>
            <i class="fas fa-chevron-left"></i>
        </button>`;
        
        const startPage = Math.max(1, currentPage - 2);
        const endPage = Math.min(totalPages, currentPage + 2);
        
        for (let i = startPage; i <= endPage; i++) {
            controls += `<button class="pagination-btn ${i === currentPage ? 'active' : ''}" onclick="userManager.changePage(${i})">${i}</button>`;
        }
        
        controls += `<button class="pagination-btn" onclick="userManager.changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>
            <i class="fas fa-chevron-right"></i>
        </button>`;
        
        document.getElementById('paginationControls').innerHTML = controls;
    }

    function changePage(page) {
        currentPage = page;
        loadUsers(currentPage, getCurrentFilters());
    }

    // ========== FILTERS ==========
    function getCurrentFilters() {
        const search = document.getElementById('searchInput').value;
        const type = document.getElementById('userTypeFilter').value;
        const verification = document.getElementById('verificationFilter').value;
        const dateFilter = document.getElementById('dateFilter').value;
        
        let filters = {
            search,
            type,
            verification,
            status: currentFilter
        };
        
        if (dateFilter === 'today') {
            const today = new Date().toISOString().split('T')[0];
            filters.startDate = today;
            filters.endDate = today;
        } else if (dateFilter === 'week') {
            const end = new Date();
            const start = new Date();
            start.setDate(start.getDate() - 7);
            filters.startDate = start.toISOString().split('T')[0];
            filters.endDate = end.toISOString().split('T')[0];
        } else if (dateFilter === 'month') {
            const end = new Date();
            const start = new Date();
            start.setMonth(start.getMonth() - 1);
            filters.startDate = start.toISOString().split('T')[0];
            filters.endDate = end.toISOString().split('T')[0];
        }
        
        return filters;
    }

    function filterUsers(filter) {
        currentFilter = filter;
        currentPage = 1;
        
        document.querySelectorAll('.stat-card').forEach(card => {
            if (card.dataset.filter === filter) {
                card.classList.add('active');
            } else {
                card.classList.remove('active');
            }
        });
        
        loadUsers(currentPage, getCurrentFilters());
    }

    function applyFilters() {
        currentPage = 1;
        loadUsers(currentPage, getCurrentFilters());
    }

    function applyCustomDate() {
        const start = document.getElementById('startDate').value;
        const end = document.getElementById('endDate').value;
        
        if (start && end) {
            document.getElementById('dateFilter').value = 'custom';
            currentPage = 1;
            loadUsers(currentPage, {
                ...getCurrentFilters(),
                startDate: start,
                endDate: end
            });
        }
    }

    // ========== USER DETAILS ==========
    async function viewUserDetails(userId) {
        try {
            const { data: user, error } = await sb
                .from('profiles')
                .select(`
                    *,
                    suppliers!suppliers_profile_id_fkey (*)
                `)
                .eq('id', userId)
                .single();
            
            if (error) throw error;
            
            const { data: ads } = await sb
                .from('ads')
                .select('*')
                .eq('seller_id', userId)
                .order('created_at', { ascending: false })
                .limit(10);
            
            const { data: buyerOrders } = await sb
                .from('orders')
                .select('*')
                .eq('buyer_id', userId)
                .order('created_at', { ascending: false })
                .limit(5);
            
            const { data: supplierOrders } = await sb
                .from('orders')
                .select('*')
                .eq('supplier_id', userId)
                .order('created_at', { ascending: false })
                .limit(5);
            
            const allOrders = [...(buyerOrders || []), ...(supplierOrders || [])]
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .slice(0, 10);
            
            renderUserDetail(user, ads || [], allOrders);
            
            openModal('userDetailModal');
            
        } catch (error) {
            console.error('Error loading user details:', error);
            showToast('Error loading user details', 'error');
        }
    }

    function renderUserDetail(user, ads, orders) {
        const container = document.getElementById('userDetailContent');
        const initials = user.full_name
            ? user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)
            : user.email.substring(0, 2).toUpperCase();
        
        const supplier = user.suppliers && user.suppliers.length > 0 ? user.suppliers[0] : null;
        
        container.innerHTML = `
            <div class="user-detail-header">
                <div class="detail-avatar">
                    ${user.avatar_url ? 
                        `<img src="${user.avatar_url}" alt="${escapeHtml(user.full_name)}">` : 
                        `<span>${initials}</span>`
                    }
                    ${user.is_verified ? '<span class="verified-badge"><i class="fas fa-check"></i></span>' : ''}
                </div>
                <div class="detail-info">
                    <h2>${escapeHtml(user.full_name || 'Unnamed User')}</h2>
                    <div class="detail-meta">
                        <span><i class="fas fa-envelope"></i> ${escapeHtml(user.email)}</span>
                        <span><i class="fas fa-phone"></i> ${escapeHtml(user.phone || 'No phone')}</span>
                        <span><i class="fas fa-map-marker-alt"></i> ${escapeHtml(user.district || user.location || 'Not specified')}</span>
                    </div>
                    <div style="margin-top: 8px;">
                        ${user.is_admin ? `<span class="user-badge ${user.admin_role === 'super_admin' ? 'badge-super-admin' : 'badge-admin'}">${user.admin_role || 'Admin'}</span>` : ''}
                        ${user.is_supplier ? '<span class="user-badge badge-supplier">Supplier</span>' : ''}
                        ${user.is_buyer ? '<span class="user-badge badge-buyer">Buyer</span>' : ''}
                        ${user.is_banned ? '<span class="user-badge badge-banned">Banned</span>' : ''}
                    </div>
                </div>
            </div>
            
            <div class="detail-grid">
                <div class="detail-item">
                    <div class="detail-label">Member Since</div>
                    <div class="detail-value">${new Date(user.created_at).toLocaleDateString()}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Last Active</div>
                    <div class="detail-value">${user.last_active ? new Date(user.last_active).toLocaleString() : 'Never'}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Total Ads</div>
                    <div class="detail-value large">${user.total_ads || 0}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Verification Status</div>
                    <div class="detail-value">
                        ${user.is_verified ? 
                            '<span style="color: var(--secondary);"><i class="fas fa-check-circle"></i> Verified</span>' : 
                            '<span style="color: var(--gray-500);"><i class="fas fa-clock"></i> Not Verified</span>'
                        }
                    </div>
                </div>
            </div>
            
            ${supplier ? `
                <h3 style="margin: 20px 0 12px;">Supplier Information</h3>
                <div class="detail-grid">
                    <div class="detail-item">
                        <div class="detail-label">Business Name</div>
                        <div class="detail-value">${escapeHtml(supplier.business_name)}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Business Type</div>
                        <div class="detail-value">${escapeHtml(supplier.business_type || 'Not specified')}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Verification Status</div>
                        <div class="detail-value ${getSupplierStatusClass(supplier.verification_status)}">
                            ${supplier.verification_status}
                        </div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">TIN Number</div>
                        <div class="detail-value">${escapeHtml(supplier.tax_id || 'Not provided')}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Warehouse Location</div>
                        <div class="detail-value">${escapeHtml(supplier.warehouse_district || 'Not specified')}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Total Orders</div>
                        <div class="detail-value">${supplier.total_orders || 0}</div>
                    </div>
                </div>
            ` : ''}
            
            <div class="tabs">
                <button class="tab active" onclick="userManager.switchTab('ads')">Recent Ads (${ads.length})</button>
                <button class="tab" onclick="userManager.switchTab('orders')">Recent Orders (${orders.length})</button>
            </div>
            
            <div id="adsTab" class="tab-content active">
                ${renderAdsTable(ads)}
            </div>
            
            <div id="ordersTab" class="tab-content">
                ${renderOrdersTable(orders)}
            </div>
        `;
    }

    function renderAdsTable(ads) {
        if (ads.length === 0) {
            return '<p style="text-align: center; padding: 20px;">No ads found</p>';
        }
        
        return `
            <table class="compact-table">
                <thead>
                    <tr>
                        <th>Title</th>
                        <th>Price</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th>Views</th>
                    </tr>
                </thead>
                <tbody>
                    ${ads.map(ad => `
                        <tr>
                            <td>${escapeHtml(ad.title)}</td>
                            <td>UGX ${ad.price ? parseInt(ad.price).toLocaleString() : 'N/A'}</td>
                            <td><span class="status-badge ${ad.status}">${ad.status}</span></td>
                            <td>${new Date(ad.created_at).toLocaleDateString()}</td>
                            <td>${ad.view_count || 0}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    function renderOrdersTable(orders) {
        if (orders.length === 0) {
            return '<p style="text-align: center; padding: 20px;">No orders found</p>';
        }
        
        return `
            <table class="compact-table">
                <thead>
                    <tr>
                        <th>Order #</th>
                        <th>Total</th>
                        <th>Status</th>
                        <th>Payment</th>
                        <th>Date</th>
                    </tr>
                </thead>
                <tbody>
                    ${orders.map(order => `
                        <tr>
                            <td>${escapeHtml(order.order_number)}</td>
                            <td>UGX ${order.total_amount ? parseInt(order.total_amount).toLocaleString() : 'N/A'}</td>
                            <td><span class="status-badge ${order.status}">${order.status}</span></td>
                            <td><span class="status-badge ${order.payment_status}">${order.payment_status}</span></td>
                            <td>${new Date(order.created_at).toLocaleDateString()}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    function switchTab(tab) {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        if (tab === 'ads') {
            document.querySelectorAll('.tab')[0].classList.add('active');
            document.getElementById('adsTab').classList.add('active');
        } else {
            document.querySelectorAll('.tab')[1].classList.add('active');
            document.getElementById('ordersTab').classList.add('active');
        }
    }

    // ========== USER ACTIONS ==========
    function openBanModal(userId, userName) {
        selectedUserId = userId;
        document.getElementById('banUserId').value = userId;
        document.getElementById('banModalTitle').textContent = `Ban User: ${userName}`;
        document.getElementById('banUserForm').reset();
        openModal('banUserModal');
    }

    async function banUser(event) {
        event.preventDefault();
        
        const userId = document.getElementById('banUserId').value;
        const reason = document.getElementById('banReason').value;
        const notes = document.getElementById('banNotes').value;
        const duration = document.querySelector('input[name="banDuration"]:checked').value;
        
        try {
            const { error } = await sb
                .from('profiles')
                .update({ 
                    is_banned: true,
                    updated_at: new Date().toISOString()
                })
                .eq('id', userId);
            
            if (error) throw error;
            
            await sb
                .from('admin_actions')
                .insert({
                    admin_id: currentUser.id,
                    action_type: 'user_banned',
                    target_user_id: userId,
                    details: { reason, notes, duration },
                    performed_at: new Date().toISOString()
                });
            
            showToast('User banned successfully', 'success');
            
            closeModal('banUserModal');
            loadUsers(currentPage, getCurrentFilters());
            
        } catch (error) {
            console.error('Error banning user:', error);
            showToast('Error banning user', 'error');
        }
    }

    async function unbanUser(userId) {
        if (!confirm('Are you sure you want to unban this user?')) return;
        
        try {
            const { error } = await sb
                .from('profiles')
                .update({ 
                    is_banned: false,
                    updated_at: new Date().toISOString()
                })
                .eq('id', userId);
            
            if (error) throw error;
            
            await sb
                .from('admin_actions')
                .insert({
                    admin_id: currentUser.id,
                    action_type: 'user_warned',
                    target_user_id: userId,
                    details: { action: 'unbanned' },
                    performed_at: new Date().toISOString()
                });
            
            showToast('User unbanned successfully', 'success');
            loadUsers(currentPage, getCurrentFilters());
            
        } catch (error) {
            console.error('Error unbanning user:', error);
            showToast('Error unbanning user', 'error');
        }
    }

    function openVerifyModal(userId, supplierId) {
        const user = users.find(u => u.id === userId);
        const supplier = user?.suppliers && user.suppliers.length > 0 ? user.suppliers[0] : null;
        
        if (!supplier) return;
        
        document.getElementById('verifySupplierId').value = supplierId;
        document.getElementById('verifyUserId').value = userId;
        document.getElementById('verifyBusinessName').value = supplier.business_name || '';
        document.getElementById('verifyBusinessReg').value = supplier.business_registration || '';
        document.getElementById('verifyTaxId').value = supplier.tax_id || '';
        document.getElementById('verificationDecision').value = 'verified';
        document.getElementById('verifyNotes').value = '';
        
        openModal('verifySupplierModal');
    }

    async function verifySupplier(event) {
        event.preventDefault();
        
        const supplierId = document.getElementById('verifySupplierId').value;
        const userId = document.getElementById('verifyUserId').value;
        const decision = document.getElementById('verificationDecision').value;
        const notes = document.getElementById('verifyNotes').value;
        
        try {
            const { error: supplierError } = await sb
                .from('suppliers')
                .update({
                    verification_status: decision,
                    verified_by: currentUser.id,
                    verified_at: decision === 'verified' ? new Date().toISOString() : null,
                    updated_at: new Date().toISOString()
                })
                .eq('id', supplierId);
            
            if (supplierError) throw supplierError;
            
            if (decision === 'verified') {
                await sb
                    .from('profiles')
                    .update({ is_verified: true })
                    .eq('id', userId);
            }
            
            await sb
                .from('admin_actions')
                .insert({
                    admin_id: currentUser.id,
                    action_type: 'user_verified',
                    target_user_id: userId,
                    details: { decision, notes },
                    performed_at: new Date().toISOString()
                });
            
            showToast(`Supplier ${decision} successfully`, 'success');
            
            closeModal('verifySupplierModal');
            loadUsers(currentPage, getCurrentFilters());
            
        } catch (error) {
            console.error('Error verifying supplier:', error);
            showToast('Error verifying supplier', 'error');
        }
    }

    function openAdminRoleModal(userId) {
        const user = users.find(u => u.id === userId);
        
        document.getElementById('adminUserId').value = userId;
        document.getElementById('adminRole').value = user?.admin_role || '';
        document.getElementById('removeAdmin').checked = false;
        
        openModal('adminRoleModal');
    }

    async function updateAdminRole(event) {
        event.preventDefault();
        
        const userId = document.getElementById('adminUserId').value;
        const role = document.getElementById('adminRole').value;
        const removeAdmin = document.getElementById('removeAdmin').checked;
        
        try {
            const updates = {
                updated_at: new Date().toISOString()
            };
            
            if (removeAdmin) {
                updates.is_admin = false;
                updates.admin_role = null;
            } else if (role) {
                updates.is_admin = true;
                updates.admin_role = role;
            }
            
            const { error } = await sb
                .from('profiles')
                .update(updates)
                .eq('id', userId);
            
            if (error) throw error;
            
            await sb
                .from('admin_actions')
                .insert({
                    admin_id: currentUser.id,
                    action_type: removeAdmin ? 'user_warned' : 'user_verified',
                    target_user_id: userId,
                    details: { admin_role: role, removed: removeAdmin },
                    performed_at: new Date().toISOString()
                });
            
            showToast(removeAdmin ? 'Admin privileges removed' : 'Admin role updated', 'success');
            
            closeModal('adminRoleModal');
            loadUsers(currentPage, getCurrentFilters());
            
        } catch (error) {
            console.error('Error updating admin role:', error);
            showToast('Error updating admin role', 'error');
        }
    }

    // ========== EXPORT USERS ==========
    function exportUsers() {
        const headers = ['Name', 'Email', 'Phone', 'Location', 'Type', 'Verified', 'Status', 'Joined', 'Last Active', 'Total Ads'];
        
        const rows = users.map(user => {
            const supplier = user.suppliers && user.suppliers.length > 0 ? user.suppliers[0] : null;
            return [
                user.full_name || '',
                user.email,
                user.phone || '',
                user.district || user.location || '',
                user.is_supplier ? 'Supplier' : (user.is_buyer ? 'Buyer' : 'User'),
                user.is_verified ? 'Yes' : 'No',
                user.is_banned ? 'Banned' : 'Active',
                new Date(user.created_at).toLocaleDateString(),
                user.last_active ? new Date(user.last_active).toLocaleDateString() : '',
                user.total_ads || 0
            ];
        });
        
        const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `users_export_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
        
        showToast('Users exported successfully', 'success');
    }

    // ========== EVENT LISTENERS SETUP ==========
    function setupEventListeners() {
        document.getElementById('searchInput').addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                currentPage = 1;
                loadUsers(currentPage, getCurrentFilters());
            }, 500);
        });
        
        document.getElementById('userTypeFilter').addEventListener('change', applyFilters);
        document.getElementById('verificationFilter').addEventListener('change', applyFilters);
        
        document.getElementById('dateFilter').addEventListener('change', (e) => {
            if (e.target.value === 'custom') {
                document.getElementById('customDateRange').style.display = 'flex';
            } else {
                document.getElementById('customDateRange').style.display = 'none';
                applyFilters();
            }
        });
        
        document.getElementById('banUserForm').addEventListener('submit', banUser);
        document.getElementById('verifySupplierForm').addEventListener('submit', verifySupplier);
        document.getElementById('adminRoleForm').addEventListener('submit', updateAdminRole);
    }

    // ========== INITIALIZATION ==========
    document.addEventListener('DOMContentLoaded', async () => {
        const isAdmin = await checkAdminAuth();
        if (!isAdmin) return;
        
        setupEventListeners();
        await loadUsers();
        
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                e.target.classList.remove('show');
            }
        });
    });

    // Public API
    return {
        filterUsers,
        applyFilters,
        applyCustomDate,
        exportUsers,
        viewUserDetails,
        openBanModal,
        unbanUser,
        openVerifyModal,
        openAdminRoleModal,
        switchTab,
        changePage,
        closeModal,
        loadUsers
    };
})();