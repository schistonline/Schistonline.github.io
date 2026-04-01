// ========== SUPPLIER APPROVALS ADMIN JAVASCRIPT ==========
const supplierApprovals = (function() {
    // Supabase Configuration
    const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';
    
    const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // ========== STATE ==========
    let currentUser = null;
    let suppliers = [];
    let filteredSuppliers = [];
    let currentStatus = 'pending';
    let currentFilter = 'all';
    let adminNotes = {}; // We'll store notes separately
    let isLoading = false;

    // ========== INITIALIZATION ==========
    document.addEventListener('DOMContentLoaded', async () => {
        try {
            await checkAuth();
            await loadSuppliers();
            await loadAdminNotes(); // Load notes separately
            setupEventListeners();
            hideLoadingSkeletons();
        } catch (error) {
            console.error('Initialization error:', error);
            showToast('Failed to initialize page', 'error');
        }
    });

    // ========== CHECK AUTH ==========
    async function checkAuth() {
        try {
            const { data: { user }, error } = await sb.auth.getUser();
            
            if (error || !user) {
                showToast('Please login as admin', 'warning');
                setTimeout(() => {
                    window.location.href = 'login.html?redirect=admin-supplier-approvals.html';
                }, 2000);
                return;
            }
            
            currentUser = user;
            
            // Check if user is admin
            const { data: profile, error: profileError } = await sb
                .from('profiles')
                .select('is_admin, admin_role, full_name')
                .eq('id', user.id)
                .single();
            
            if (profileError) throw profileError;
            
            if (!profile?.is_admin) {
                showToast('Access denied. Admin privileges required.', 'error');
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 2000);
            }
            
        } catch (error) {
            console.error('Auth check error:', error);
            showToast('Authentication error', 'error');
        }
    }

    // ========== LOAD SUPPLIERS ==========
    async function loadSuppliers() {
        isLoading = true;
        
        try {
            const { data, error } = await sb
                .from('suppliers')
                .select(`
                    *,
                    profile:profiles!suppliers_profile_id_fkey (
                        id,
                        full_name,
                        email,
                        phone,
                        avatar_url,
                        created_at
                    )
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;

            suppliers = data || [];
            
            updateStats();
            filterSuppliers();

        } catch (error) {
            console.error('Error loading suppliers:', error);
            showToast('Error loading suppliers: ' + error.message, 'error');
        } finally {
            isLoading = false;
        }
    }

    // ========== LOAD ADMIN NOTES ==========
    async function loadAdminNotes() {
        try {
            // Get all admin actions related to suppliers
            // Since there's no direct relationship, we'll get all admin actions
            // and filter them client-side
            const { data, error } = await sb
                .from('admin_actions')
                .select(`
                    *,
                    admin:profiles!admin_actions_admin_id_fkey (
                        full_name
                    )
                `)
                .order('performed_at', { ascending: false });

            if (error) throw error;

            // Group notes by target_ad_id (since there's no supplier-specific column)
            // We'll use target_ad_id as a workaround or create a separate notes table
            // For now, we'll store them in memory
            adminNotes = {};
            
            (data || []).forEach(action => {
                // Since there's no supplier_id in admin_actions, we need to decide how to store notes
                // Option 1: Use target_ad_id and map to supplier (not ideal)
                // Option 2: Create a separate supplier_notes table (recommended)
                // For now, we'll just log that we need to implement this properly
                console.log('Admin action:', action);
            });

            // For demonstration, we'll create empty notes for now
            suppliers.forEach(supplier => {
                adminNotes[supplier.id] = [];
            });

        } catch (error) {
            console.error('Error loading admin notes:', error);
            // Don't show error to user, just initialize empty notes
            suppliers.forEach(supplier => {
                adminNotes[supplier.id] = [];
            });
        }
    }

    // ========== UPDATE STATS ==========
    function updateStats() {
        const stats = {
            pending: suppliers.filter(s => s.verification_status === 'pending').length,
            verified: suppliers.filter(s => s.verification_status === 'verified').length,
            rejected: suppliers.filter(s => s.verification_status === 'rejected').length,
            suspended: suppliers.filter(s => s.verification_status === 'suspended').length
        };

        setElementText('statPending', stats.pending);
        setElementText('statVerified', stats.verified);
        setElementText('statRejected', stats.rejected);
        setElementText('statTotal', suppliers.length);
    }

    // ========== FILTER SUPPLIERS ==========
    function filterSuppliers() {
        const searchTerm = document.getElementById('searchInput')?.value?.toLowerCase().trim() || '';

        filteredSuppliers = suppliers.filter(supplier => {
            // Filter by status
            if (currentStatus !== 'all' && supplier.verification_status !== currentStatus) {
                return false;
            }

            // Filter by document filter
            if (currentFilter === 'withDocs') {
                const docs = supplier.verification_docs || {};
                if (!docs.certificate && !docs.tin && !docs.license) {
                    return false;
                }
            }

            if (currentFilter === 'urgent') {
                const daysSinceRegistration = Math.floor((new Date() - new Date(supplier.created_at)) / (1000 * 60 * 60 * 24));
                if (daysSinceRegistration < 7 || supplier.verification_status !== 'pending') {
                    return false;
                }
            }

            if (currentFilter === 'today') {
                const today = new Date().toDateString();
                const regDate = new Date(supplier.created_at).toDateString();
                if (today !== regDate) {
                    return false;
                }
            }

            // Search filter
            if (searchTerm) {
                const businessName = supplier.business_name?.toLowerCase() || '';
                const email = supplier.business_email?.toLowerCase() || '';
                const phone = supplier.business_phone?.toLowerCase() || '';
                const taxId = supplier.tax_id?.toLowerCase() || '';
                
                if (!businessName.includes(searchTerm) && 
                    !email.includes(searchTerm) && 
                    !phone.includes(searchTerm) &&
                    !taxId.includes(searchTerm)) {
                    return false;
                }
            }

            return true;
        });

        renderSuppliers();
    }

    // ========== RENDER SUPPLIERS ==========
    function renderSuppliers() {
        const container = document.getElementById('suppliersGrid');
        if (!container) return;

        if (filteredSuppliers.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="grid-column: 1/-1;">
                    <div class="empty-icon">
                        <i class="fas fa-store"></i>
                    </div>
                    <h3 class="empty-title">No Suppliers Found</h3>
                    <p class="empty-text">No suppliers match your current filters</p>
                </div>
            `;
            return;
        }

        container.innerHTML = filteredSuppliers.map(supplier => {
            try {
                return renderSupplierCard(supplier);
            } catch (error) {
                console.error('Error rendering supplier card:', error, supplier);
                return '';
            }
        }).join('');
    }

    // ========== RENDER SUPPLIER CARD ==========
    function renderSupplierCard(supplier) {
        const profile = supplier.profile || {};
        const daysSinceRegistration = Math.floor((new Date() - new Date(supplier.created_at)) / (1000 * 60 * 60 * 24));
        const isUrgent = daysSinceRegistration >= 7 && supplier.verification_status === 'pending';
        
        // Get documents
        const docs = supplier.verification_docs || {};
        const hasDocs = docs.certificate || docs.tin || docs.license;

        return `
            <div class="supplier-card" data-id="${escapeHtml(supplier.id)}">
                <div class="card-header">
                    <div class="header-top">
                        <div class="supplier-avatar">
                            ${profile.avatar_url ? 
                                `<img src="${escapeHtml(profile.avatar_url)}" alt="${escapeHtml(supplier.business_name)}">` : 
                                escapeHtml(supplier.business_name?.charAt(0) || 'S')}
                        </div>
                        ${isUrgent ? '<div class="urgent-badge"><i class="fas fa-clock"></i> Urgent</div>' : ''}
                    </div>
                    <div class="supplier-name">${escapeHtml(supplier.business_name || 'Unnamed Business')}</div>
                    <div class="supplier-email">${escapeHtml(supplier.business_email || profile.email || 'No email')}</div>
                    <div class="supplier-phone">
                        <i class="fas fa-phone"></i>
                        ${escapeHtml(supplier.business_phone || profile.phone || 'No phone')}
                    </div>
                </div>

                <div class="card-body">
                    <div class="info-row">
                        <span class="info-label">Business Type</span>
                        <span class="info-value">
                            <span class="business-type">${escapeHtml(supplier.business_type || 'Not specified')}</span>
                        </span>
                    </div>

                    <div class="info-row">
                        <span class="info-label">Registration</span>
                        <span class="info-value">${escapeHtml(supplier.business_registration || 'Not provided')}</span>
                    </div>

                    <div class="info-row">
                        <span class="info-label">TIN</span>
                        <span class="info-value">${escapeHtml(supplier.tax_id || 'Not provided')}</span>
                    </div>

                    <div class="info-row">
                        <span class="info-label">Location</span>
                        <span class="info-value">${escapeHtml(supplier.warehouse_district || 'Not specified')}</span>
                    </div>

                    <div class="info-row">
                        <span class="info-label">Registered</span>
                        <span class="info-value">${formatDate(supplier.created_at)}</span>
                    </div>

                    ${hasDocs ? renderDocuments(docs) : ''}

                    <!-- Admin Notes - Temporarily disabled until we fix the relationship -->
                    <div class="notes-section">
                        <div class="documents-title">
                            <i class="fas fa-sticky-note"></i>
                            Admin Notes
                        </div>
                        <div id="notes-${supplier.id}">
                            <p style="color: #6B7280; font-size: 12px; padding: 8px;">Notes feature coming soon</p>
                        </div>
                        <textarea class="note-input" id="note-${supplier.id}" placeholder="Add a note (coming soon)..." rows="2" disabled></textarea>
                        <button class="action-btn btn-pending" onclick="supplierApprovals.addNote('${supplier.id}')" style="width: 100%;" disabled>
                            <i class="fas fa-plus"></i> Add Note (Coming Soon)
                        </button>
                    </div>

                    <!-- Timeline -->
                    <div class="timeline">
                        <div class="timeline-item">
                            <div class="timeline-icon pending">
                                <i class="fas fa-clock"></i>
                            </div>
                            <div class="timeline-content">
                                <div class="timeline-title">Application Submitted</div>
                                <div class="timeline-time">${formatDate(supplier.created_at)}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="card-footer">
                    ${renderActionButtons(supplier)}
                </div>
            </div>
        `;
    }

    // ========== RENDER DOCUMENTS ==========
    function renderDocuments(docs) {
        const documents = [];

        if (docs.certificate) {
            documents.push({
                name: 'Business Registration Certificate',
                icon: 'fa-file-contract',
                file: docs.certificate,
                verified: docs.certificate_verified
            });
        }

        if (docs.tin) {
            documents.push({
                name: 'TIN Certificate',
                icon: 'fa-file-invoice',
                file: docs.tin,
                verified: docs.tin_verified
            });
        }

        if (docs.license) {
            documents.push({
                name: 'Trade License',
                icon: 'fa-file-signature',
                file: docs.license,
                verified: docs.license_verified
            });
        }

        if (documents.length === 0) return '';

        return `
            <div class="documents-section">
                <div class="documents-title">
                    <i class="fas fa-file-alt"></i>
                    Verification Documents
                </div>
                ${documents.map(doc => `
                    <div class="document-item">
                        <div class="document-icon">
                            <i class="fas ${doc.icon}"></i>
                        </div>
                        <div class="document-info">
                            <div class="document-name">${doc.name}</div>
                            <div class="document-meta">
                                ${doc.file ? 'Uploaded' : 'Not uploaded'}
                                ${doc.verified ? ' • <span style="color: #10B981;">Verified</span>' : ''}
                            </div>
                        </div>
                        <div class="document-actions">
                            ${doc.file ? `
                                <button class="doc-btn doc-btn-view" onclick="supplierApprovals.viewDocument('${escapeHtml(doc.file)}')">
                                    <i class="fas fa-eye"></i>
                                </button>
                            ` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    // ========== RENDER ACTION BUTTONS ==========
    function renderActionButtons(supplier) {
        const status = supplier.verification_status;
        
        switch(status) {
            case 'pending':
                return `
                    <button class="action-btn btn-approve" onclick="supplierApprovals.updateStatus('${supplier.id}', 'verified')">
                        <i class="fas fa-check"></i> Approve
                    </button>
                    <button class="action-btn btn-reject" onclick="supplierApprovals.updateStatus('${supplier.id}', 'rejected')">
                        <i class="fas fa-times"></i> Reject
                    </button>
                `;
            
            case 'verified':
                return `
                    <button class="action-btn btn-suspend" onclick="supplierApprovals.updateStatus('${supplier.id}', 'suspended')">
                        <i class="fas fa-ban"></i> Suspend
                    </button>
                    <button class="action-btn btn-pending" onclick="supplierApprovals.updateStatus('${supplier.id}', 'pending')">
                        <i class="fas fa-undo"></i> Reset
                    </button>
                `;
            
            case 'rejected':
                return `
                    <button class="action-btn btn-approve" onclick="supplierApprovals.updateStatus('${supplier.id}', 'pending')">
                        <i class="fas fa-undo"></i> Reconsider
                    </button>
                    <button class="action-btn btn-pending" onclick="supplierApprovals.updateStatus('${supplier.id}', 'verified')">
                        <i class="fas fa-check"></i> Force Approve
                    </button>
                `;
            
            case 'suspended':
                return `
                    <button class="action-btn btn-approve" onclick="supplierApprovals.updateStatus('${supplier.id}', 'verified')">
                        <i class="fas fa-check"></i> Reinstate
                    </button>
                    <button class="action-btn btn-pending" onclick="supplierApprovals.updateStatus('${supplier.id}', 'pending')">
                        <i class="fas fa-undo"></i> Reset
                    </button>
                `;
            
            default:
                return `
                    <button class="action-btn btn-pending" onclick="supplierApprovals.updateStatus('${supplier.id}', 'pending')">
                        <i class="fas fa-sync"></i> Set Pending
                    </button>
                `;
        }
    }

    // ========== ADD NOTE (Temporarily disabled) ==========
    async function addNote(supplierId) {
        showToast('Notes feature coming soon. Please check back later.', 'info');
        return;
        
        // Original code commented out until we fix the relationship
        /*
        const noteInput = document.getElementById(`note-${supplierId}`);
        if (!noteInput) return;
        
        const note = noteInput.value.trim();

        if (!note) {
            showToast('Please enter a note', 'warning');
            return;
        }

        try {
            // This will fail until we add proper relationship
            const { data, error } = await sb
                .from('admin_actions')
                .insert({
                    admin_id: currentUser.id,
                    action_type: 'note',
                    target_supplier_id: supplierId, // This column doesn't exist
                    details: note,
                    performed_at: new Date().toISOString()
                })
                .select(`
                    *,
                    admin:profiles!admin_actions_admin_id_fkey (
                        full_name
                    )
                `)
                .single();

            if (error) throw error;

            // Add to local state
            if (!adminNotes[supplierId]) {
                adminNotes[supplierId] = [];
            }
            adminNotes[supplierId].unshift(data);

            // Clear input
            noteInput.value = '';

            // Refresh supplier card
            const supplier = suppliers.find(s => s.id === supplierId);
            const index = suppliers.findIndex(s => s.id === supplierId);
            if (index !== -1) {
                suppliers[index] = { 
                    ...supplier, 
                    admin_notes: adminNotes[supplierId] 
                };
            }
            
            filterSuppliers();
            showToast('Note added successfully', 'success');

        } catch (error) {
            console.error('Error adding note:', error);
            showToast('Error adding note: ' + error.message, 'error');
        }
        */
    }

    // ========== UPDATE STATUS ==========
    async function updateStatus(supplierId, newStatus) {
        if (!confirm(`Are you sure you want to change status to ${newStatus}?`)) {
            return;
        }

        try {
            const supplier = suppliers.find(s => s.id === supplierId);
            if (!supplier) {
                showToast('Supplier not found', 'error');
                return;
            }

            const { error } = await sb
                .from('suppliers')
                .update({
                    verification_status: newStatus,
                    verified_by: currentUser.id,
                    verified_at: newStatus === 'verified' ? new Date().toISOString() : null,
                    updated_at: new Date().toISOString()
                })
                .eq('id', supplierId);

            if (error) throw error;

            // Log admin action (using existing columns)
            await sb
                .from('admin_actions')
                .insert({
                    admin_id: currentUser.id,
                    action_type: 'user_verified', // Use existing action_type
                    target_user_id: supplier.profile_id, // Use target_user_id
                    details: { 
                        action: `status_changed_to_${newStatus}`,
                        previous_status: supplier.verification_status,
                        new_status: newStatus
                    },
                    performed_at: new Date().toISOString()
                });

            // Create notification for supplier
            if (supplier.profile_id) {
                await sb
                    .from('notifications')
                    .insert({
                        user_id: supplier.profile_id,
                        type: 'admin_alert',
                        title: `Verification ${newStatus}`,
                        message: `Your supplier account has been ${newStatus}`,
                        link: '/supplier-verification.html',
                        created_at: new Date().toISOString()
                    });
            }

            // Update local state
            const index = suppliers.findIndex(s => s.id === supplierId);
            suppliers[index].verification_status = newStatus;
            
            updateStats();
            filterSuppliers();
            
            showToast(`Supplier status updated to ${newStatus}`, 'success');

        } catch (error) {
            console.error('Error updating status:', error);
            showToast('Error updating status: ' + error.message, 'error');
        }
    }

    // ========== VIEW DOCUMENT ==========
    function viewDocument(filePath) {
        if (!filePath) {
            showToast('No document available', 'warning');
            return;
        }
        window.open(filePath, '_blank');
    }

    // ========== HIDE LOADING SKELETONS ==========
    function hideLoadingSkeletons() {
        const skeletons = document.querySelectorAll('.skeleton-card');
        skeletons.forEach(skeleton => skeleton.remove());
    }

    // ========== SETUP EVENT LISTENERS ==========
    function setupEventListeners() {
        // Tab switching
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                currentStatus = tab.dataset.status;
                filterSuppliers();
            });
        });

        // Filter chips
        document.querySelectorAll('.filter-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                
                currentFilter = chip.dataset.filter;
                filterSuppliers();
            });
        });

        // Search
        let searchTimeout;
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(filterSuppliers, 500);
            });
        }

        // Menu button
        const menuBtn = document.getElementById('menuBtn');
        if (menuBtn) {
            menuBtn.addEventListener('click', () => {
                window.location.href = 'admin-dashboard.html';
            });
        }
    }

    // ========== UTILITIES ==========
    function formatDate(dateString) {
        if (!dateString) return 'N/A';
        
        try {
            const date = new Date(dateString);
            const now = new Date();
            const diff = now - date;
            
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            
            if (days === 0) return 'Today';
            if (days === 1) return 'Yesterday';
            if (days < 7) return `${days} days ago`;
            
            return date.toLocaleDateString('en-UG', { 
                month: 'short', 
                day: 'numeric',
                year: 'numeric'
            });
        } catch {
            return 'Invalid Date';
        }
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function setElementText(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    }

    function showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        if (!toast) return;
        
        toast.textContent = message;
        toast.className = `toast show ${type}`;
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    // ========== PUBLIC API ==========
    return {
        addNote,
        updateStatus,
        viewDocument
    };
})();

// Assign to window for global access
window.supplierApprovals = supplierApprovals;