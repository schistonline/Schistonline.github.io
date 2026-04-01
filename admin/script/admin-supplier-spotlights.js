// ========== SUPPLIER SPOTLIGHT ADMIN JAVASCRIPT ==========
const spotlightManager = (function() {
    const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';
    
    const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // State
    let currentSpotlights = [];
    let currentPackages = [];
    let suppliers = [];
    let currentDeleteId = null;
    let currentTab = 'active';
    let currentUser = null;

    // ========== INITIALIZATION ==========
    document.addEventListener('DOMContentLoaded', async () => {
        try {
            await checkAdminAuth();
            await loadPackages();
            await loadSpotlights();
            await loadStats();
            setupSearch();
            setupEventListeners();
        } catch (error) {
            console.error('Initialization error:', error);
            showToast('Failed to initialize page', 'error');
        }
    });

    // ========== AUTHENTICATION ==========
    async function checkAdminAuth() {
        try {
            const { data: { user }, error: authError } = await sb.auth.getUser();
            
            if (authError) throw authError;
            
            if (!user) {
                window.location.href = 'admin-login.html?redirect=admin-supplier-spotlights.html';
                return;
            }

            const { data: profile, error: profileError } = await sb
                .from('profiles')
                .select('is_admin, admin_role, full_name')
                .eq('id', user.id)
                .single();

            if (profileError) throw profileError;

            if (!profile?.is_admin) {
                showToast('You do not have admin access', 'error');
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 2000);
                return;
            }

            currentUser = { ...user, ...profile };
            
        } catch (error) {
            console.error('Auth error:', error);
            showToast('Authentication error. Please log in again.', 'error');
            setTimeout(() => {
                window.location.href = 'admin-login.html';
            }, 2000);
        }
    }

    // ========== LOAD PACKAGES ==========
    async function loadPackages() {
        try {
            const { data, error } = await sb
                .from('supplier_spotlight_packages')
                .select('*')
                .eq('is_active', true)
                .order('price', { ascending: true });

            if (error) throw error;

            currentPackages = data || [];

            const packageSelect = document.getElementById('packageId');
            const packageFilter = document.getElementById('packageFilter');

            if (packageSelect) {
                packageSelect.innerHTML = '<option value="">Select a Package</option>' +
                    currentPackages.map(pkg => 
                        `<option value="${pkg.id}" data-days="${pkg.duration_days}" data-price="${pkg.price}">
                            ${escapeHtml(pkg.package_name)} - ${pkg.duration_days} days (UGX ${pkg.price?.toLocaleString() || '0'})
                        </option>`
                    ).join('');
            }

            if (packageFilter) {
                packageFilter.innerHTML = '<option value="">All Packages</option>' +
                    currentPackages.map(pkg => 
                        `<option value="${pkg.id}">${escapeHtml(pkg.package_name)}</option>`
                    ).join('');
            }
        } catch (error) {
            console.error('Error loading packages:', error);
            showToast('Failed to load packages: ' + error.message, 'error');
        }
    }

    // ========== LOAD SUPPLIERS ==========
    async function loadSuppliers() {
        try {
            const { data, error } = await sb
                .from('suppliers')
                .select(`
                    id,
                    business_name,
                    business_type,
                    warehouse_district,
                    verification_status,
                    profile_id,
                    profiles!suppliers_profile_id_fkey (
                        full_name,
                        avatar_url,
                        is_verified
                    )
                `)
                .eq('verification_status', 'verified')
                .order('business_name', { ascending: true });

            if (error) throw error;

            return data || [];
        } catch (error) {
            console.error('Error loading suppliers:', error);
            showToast('Failed to load suppliers: ' + error.message, 'error');
            return [];
        }
    }

    // ========== LOAD SPOTLIGHTS ==========
    async function loadSpotlights() {
        showLoading(true);

        try {
            let query = sb
                .from('supplier_spotlights')
                .select(`
                    *,
                    supplier:suppliers!supplier_spotlights_supplier_id_fkey (
                        id,
                        business_name,
                        business_type,
                        warehouse_district,
                        verification_status,
                        profile_id,
                        profiles!suppliers_profile_id_fkey (
                            full_name,
                            avatar_url,
                            is_verified
                        )
                    ),
                    package:supplier_spotlight_packages!supplier_spotlights_package_id_fkey (
                        id,
                        package_name,
                        duration_days,
                        price
                    )
                `)
                .order('created_at', { ascending: false });

            // Apply tab filter
            const now = new Date().toISOString();
            
            switch(currentTab) {
                case 'active':
                    query = query
                        .eq('is_active', true)
                        .eq('payment_status', 'paid')
                        .lte('start_date', now)
                        .gt('end_date', now);
                    break;
                case 'pending':
                    query = query.eq('payment_status', 'pending');
                    break;
                case 'expired':
                    query = query
                        .or(`end_date.lt.${now},payment_status.eq.failed,payment_status.eq.expired`);
                    break;
                default:
                    // 'all' - no additional filters
                    break;
            }

            // Apply package filter
            const packageId = document.getElementById('packageFilter')?.value;
            if (packageId && isValidUuid(packageId)) {
                query = query.eq('package_id', packageId);
            }

            // Apply status filter
            const statusFilter = document.getElementById('statusFilter')?.value;
            if (statusFilter) {
                query = query.eq('payment_status', statusFilter);
            }

            const { data, error } = await query;

            if (error) throw error;

            currentSpotlights = data || [];
            
            // Apply client-side search if needed
            const searchTerm = document.getElementById('searchInput')?.value?.toLowerCase().trim();
            if (searchTerm) {
                currentSpotlights = currentSpotlights.filter(s => {
                    const supplier = getNestedObject(s, 'supplier');
                    return supplier?.business_name?.toLowerCase().includes(searchTerm) ||
                           supplier?.business_type?.toLowerCase().includes(searchTerm) ||
                           s.transaction_id?.toLowerCase().includes(searchTerm);
                });
            }
            
            renderSpotlightsTable();

            // Update pending badge
            const pendingCount = currentSpotlights.filter(s => s.payment_status === 'pending').length;
            const badge = document.getElementById('pendingSpotlightsBadge');
            if (badge) {
                badge.textContent = pendingCount;
                badge.style.display = pendingCount > 0 ? 'inline-block' : 'none';
            }

        } catch (error) {
            console.error('Error loading spotlights:', error);
            showToast('Failed to load spotlights: ' + error.message, 'error');
            showEmptyState('error', 'Failed to load spotlights. Please try again.');
        } finally {
            showLoading(false);
        }
    }

    // ========== RENDER SPOTLIGHTS TABLE ==========
    function renderSpotlightsTable() {
        const tbody = document.getElementById('spotlightsTableBody');
        const emptyState = document.getElementById('emptyState');
        const table = document.getElementById('spotlightsTable');

        if (!tbody || !emptyState || !table) return;

        if (!currentSpotlights || currentSpotlights.length === 0) {
            table.style.display = 'none';
            emptyState.style.display = 'block';
            return;
        }

        table.style.display = 'block';
        emptyState.style.display = 'none';

        const now = new Date();

        tbody.innerHTML = currentSpotlights.map(spotlight => {
            try {
                const supplier = getNestedObject(spotlight, 'supplier');
                const pkg = getNestedObject(spotlight, 'package');
                
                if (!supplier) return ''; // Skip if no supplier data

                const startDate = new Date(spotlight.start_date);
                const endDate = new Date(spotlight.end_date);
                
                // Calculate days remaining
                const daysRemaining = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
                const totalDays = pkg?.duration_days || 7;
                const progress = totalDays > 0 ? ((totalDays - Math.max(0, daysRemaining)) / totalDays) * 100 : 0;

                // Get profile data
                const profile = getNestedObject(supplier, 'profiles');

                // Determine status badge
                const statusBadge = getStatusBadge(spotlight, endDate, now);

                return `
                    <tr>
                        <td>
                            <div class="supplier-info">
                                <div class="supplier-avatar">
                                    ${profile?.avatar_url ? 
                                        `<img src="${profile.avatar_url}" alt="${escapeHtml(supplier?.business_name || 'Supplier')}" loading="lazy">` :
                                        `<span>${escapeHtml(supplier?.business_name?.charAt(0) || 'S')}</span>`
                                    }
                                </div>
                                <div class="supplier-details">
                                    <div class="supplier-name">${escapeHtml(supplier?.business_name || 'Unknown Supplier')}</div>
                                    <div class="supplier-business">${escapeHtml(supplier?.business_type || 'Business')}</div>
                                </div>
                            </div>
                        </td>
                        <td>
                            <strong>${escapeHtml(pkg?.package_name || 'Custom Package')}</strong>
                            <div style="font-size: 11px; color: var(--gray-500);">
                                UGX ${(spotlight.amount_paid || pkg?.price || 0).toLocaleString()}
                            </div>
                        </td>
                        <td>
                            <div>${formatDate(spotlight.start_date)} - ${formatDate(spotlight.end_date)}</div>
                            <div class="days-remaining">
                                <span style="font-size: 12px;">${daysRemaining > 0 ? daysRemaining + ' days left' : 'Expired'}</span>
                                <div class="progress-bar">
                                    <div class="progress-fill" style="width: ${Math.min(100, Math.max(0, progress))}%"></div>
                                </div>
                            </div>
                        </td>
                        <td>
                            <span class="spotlight-badge" style="background: ${spotlight.badge_color || '#EF4444'};">
                                ${escapeHtml(spotlight.badge_text || 'HOT')}
                            </span>
                        </td>
                        <td>${spotlight.position_priority || '999'}</td>
                        <td>
                            <div>${escapeHtml(spotlight.payment_method || '-')}</div>
                            <div style="font-size: 11px; color: var(--gray-500);">${escapeHtml(spotlight.transaction_id || '')}</div>
                        </td>
                        <td>
                            <div><i class="fas fa-eye"></i> ${spotlight.view_count || 0}</div>
                            <div><i class="fas fa-mouse-pointer"></i> ${spotlight.click_count || 0}</div>
                        </td>
                        <td>${statusBadge}</td>
                        <td>
                            <div class="action-buttons">
                                <button class="btn btn-sm btn-icon" onclick="spotlightManager.viewSpotlight(${spotlight.id})" title="View Details">
                                    <i class="fas fa-eye"></i>
                                </button>
                                <button class="btn btn-sm btn-icon" onclick="spotlightManager.editSpotlight(${spotlight.id})" title="Edit">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn btn-sm btn-icon btn-danger" onclick="spotlightManager.deleteSpotlight(${spotlight.id})" title="Delete">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            } catch (error) {
                console.error('Error rendering spotlight row:', error, spotlight);
                return '';
            }
        }).join('');
    }

    // ========== LOAD STATS ==========
    async function loadStats() {
        try {
            const now = new Date().toISOString();
            
            // Active spotlights
            const { count: activeCount, error: activeError } = await sb
                .from('supplier_spotlights')
                .select('*', { count: 'exact', head: true })
                .eq('is_active', true)
                .eq('payment_status', 'paid')
                .lte('start_date', now)
                .gt('end_date', now);

            if (activeError) throw activeError;
            setElementText('activeSpotlightsCount', activeCount || 0);

            // Pending spotlights
            const { count: pendingCount, error: pendingError } = await sb
                .from('supplier_spotlights')
                .select('*', { count: 'exact', head: true })
                .eq('payment_status', 'pending');

            if (pendingError) throw pendingError;
            setElementText('pendingSpotlightsCount', pendingCount || 0);

            // Total revenue
            const { data: revenueData, error: revenueError } = await sb
                .from('supplier_spotlights')
                .select('amount_paid')
                .eq('payment_status', 'paid');

            if (revenueError) throw revenueError;
            
            const totalRevenue = (revenueData || []).reduce((sum, item) => sum + (item.amount_paid || 0), 0);
            setElementText('totalRevenue', `UGX ${totalRevenue.toLocaleString()}`);

            // Total clicks
            const { data: clicksData, error: clicksError } = await sb
                .from('supplier_spotlights')
                .select('click_count');

            if (clicksError) throw clicksError;
            
            const totalClicks = (clicksData || []).reduce((sum, item) => sum + (item.click_count || 0), 0);
            setElementText('totalClicks', totalClicks);

        } catch (error) {
            console.error('Error loading stats:', error);
            showToast('Failed to load statistics: ' + error.message, 'error');
        }
    }

    // ========== OPEN CREATE MODAL ==========
    async function openCreateSpotlightModal() {
        try {
            document.getElementById('modalTitle').innerHTML = '<i class="fas fa-fire"></i> Create Supplier Spotlight';
            document.getElementById('spotlightForm').reset();
            document.getElementById('spotlightId').value = '';
            
            // Load suppliers for selection
            suppliers = await loadSuppliers();
            renderSupplierSelector(suppliers);

            // Set default dates
            const now = new Date();
            const endDate = new Date();
            endDate.setDate(now.getDate() + 7);

            document.getElementById('startDate').value = now.toISOString().slice(0, 16);
            document.getElementById('endDate').value = endDate.toISOString().slice(0, 16);
            document.getElementById('isActive').checked = true;
            document.getElementById('paymentStatus').value = 'pending';

            document.getElementById('spotlightModal').classList.add('show');
        } catch (error) {
            console.error('Error opening create modal:', error);
            showToast('Failed to open create form', 'error');
        }
    }

    // ========== RENDER SUPPLIER SELECTOR ==========
    function renderSupplierSelector(suppliersList) {
        const container = document.getElementById('supplierSelector');
        if (!container) return;
        
        if (!suppliersList || suppliersList.length === 0) {
            container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--gray-500);">No verified suppliers found</div>';
            return;
        }

        container.innerHTML = suppliersList.map(supplier => `
            <div class="supplier-option" onclick="spotlightManager.selectSupplier('${supplier.id}')" data-id="${supplier.id}">
                <div class="supplier-option-avatar">
                    <img src="${supplier.profiles?.avatar_url || 'https://via.placeholder.com/40'}" alt="${escapeHtml(supplier.business_name)}" loading="lazy">
                </div>
                <div class="supplier-option-info">
                    <h4>${escapeHtml(supplier.business_name)}</h4>
                    <p>${escapeHtml(supplier.warehouse_district || 'Uganda')} • ${supplier.verification_status}</p>
                </div>
            </div>
        `).join('');
    }

    // ========== SELECT SUPPLIER ==========
    function selectSupplier(supplierId) {
        if (!supplierId || !isValidUuid(supplierId)) {
            showToast('Invalid supplier selection', 'error');
            return;
        }

        document.getElementById('supplierId').value = supplierId;
        
        // Highlight selected
        document.querySelectorAll('.supplier-option').forEach(opt => {
            opt.classList.remove('selected');
        });
        
        const selectedOpt = document.querySelector(`.supplier-option[data-id="${supplierId}"]`);
        if (selectedOpt) {
            selectedOpt.classList.add('selected');
        }

        // Update preview
        const supplier = suppliers.find(s => s.id === supplierId);
        if (supplier) {
            updatePreview(supplier);
        }
    }

    // ========== UPDATE PACKAGE DETAILS ==========
    function updatePackageDetails() {
        const packageId = document.getElementById('packageId').value;
        const selected = currentPackages.find(p => p.id == packageId);

        if (selected) {
            const startDate = new Date();
            const endDate = new Date();
            endDate.setDate(startDate.getDate() + (selected.duration_days || 7));

            document.getElementById('startDate').value = startDate.toISOString().slice(0, 16);
            document.getElementById('endDate').value = endDate.toISOString().slice(0, 16);
            document.getElementById('amountPaid').value = selected.price || '';
            
            showToast(`Package selected: ${selected.duration_days} days for UGX ${selected.price?.toLocaleString()}`, 'success');
        }
    }

    // ========== UPDATE PREVIEW ==========
    function updatePreview(supplier) {
        if (!supplier) return;
        
        const previewName = document.getElementById('previewName');
        const previewLocation = document.getElementById('previewLocation');
        const previewAvatar = document.querySelector('#previewAvatar img');
        const previewBadge = document.getElementById('previewBadge');
        
        if (previewName) previewName.textContent = supplier.business_name || 'Supplier Name';
        if (previewLocation) previewLocation.innerHTML = `<i class="fas fa-map-marker-alt"></i> ${supplier.warehouse_district || 'Uganda'}`;
        if (previewAvatar) previewAvatar.src = supplier.profiles?.avatar_url || 'https://via.placeholder.com/70';
        if (previewBadge) previewBadge.textContent = document.getElementById('spotlightBadge').value || 'HOT';
    }

    // ========== EDIT SPOTLIGHT ==========
    async function editSpotlight(id) {
        try {
            const spotlight = currentSpotlights.find(s => s.id === id);
            if (!spotlight) {
                showToast('Spotlight not found', 'error');
                return;
            }

            document.getElementById('modalTitle').innerHTML = '<i class="fas fa-fire"></i> Edit Spotlight';
            document.getElementById('spotlightId').value = spotlight.id;
            
            const supplier = getNestedObject(spotlight, 'supplier');
            const pkg = getNestedObject(spotlight, 'package');
            
            // Set form values
            document.getElementById('supplierId').value = supplier?.id || '';
            document.getElementById('packageId').value = spotlight.package_id || '';
            document.getElementById('displayPosition').value = spotlight.position_priority || 0;
            document.getElementById('spotlightTitle').value = spotlight.spotlight_title || '';
            document.getElementById('spotlightBadge').value = spotlight.badge_text || 'HOT';
            document.getElementById('badgeColor').value = spotlight.badge_color || '#EF4444';
            document.getElementById('customImageUrl').value = spotlight.custom_image_url || '';
            document.getElementById('startDate').value = spotlight.start_date ? spotlight.start_date.slice(0, 16) : '';
            document.getElementById('endDate').value = spotlight.end_date ? spotlight.end_date.slice(0, 16) : '';
            document.getElementById('amountPaid').value = spotlight.amount_paid || '';
            document.getElementById('paymentStatus').value = spotlight.payment_status || 'pending';
            document.getElementById('paymentMethod').value = spotlight.payment_method || '';
            document.getElementById('transactionId').value = spotlight.transaction_id || '';
            document.getElementById('isActive').checked = spotlight.is_active || false;

            // Load and select supplier
            suppliers = await loadSuppliers();
            renderSupplierSelector(suppliers);
            
            // Highlight selected supplier
            if (supplier?.id) {
                setTimeout(() => {
                    const selectedOpt = document.querySelector(`.supplier-option[data-id="${supplier.id}"]`);
                    if (selectedOpt) {
                        selectedOpt.classList.add('selected');
                        selectedOpt.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                    updatePreview(supplier);
                }, 100);
            }

            document.getElementById('spotlightModal').classList.add('show');
            
        } catch (error) {
            console.error('Error editing spotlight:', error);
            showToast('Failed to load spotlight for editing', 'error');
        }
    }

    // ========== SAVE SPOTLIGHT ==========
    async function saveSpotlight(event) {
        event.preventDefault();

        try {
            // Validate required fields
            const supplierId = document.getElementById('supplierId').value;
            if (!supplierId || !isValidUuid(supplierId)) {
                showToast('Please select a valid supplier', 'error');
                return;
            }

            const startDate = document.getElementById('startDate').value;
            const endDate = document.getElementById('endDate').value;

            if (!startDate || !endDate) {
                showToast('Please select start and end dates', 'error');
                return;
            }

            // Validate dates
            const start = new Date(startDate);
            const end = new Date(endDate);
            
            if (end <= start) {
                showToast('End date must be after start date', 'error');
                return;
            }

            // Build spotlight data object
            const spotlightData = {
                // UUID fields - must be valid UUID or null
                supplier_id: supplierId,
                package_id: validateUuidField(document.getElementById('packageId').value),
                
                // Integer fields
                position_priority: parseInt(document.getElementById('displayPosition').value) || 0,
                
                // Text fields
                spotlight_title: document.getElementById('spotlightTitle').value?.trim() || null,
                badge_text: document.getElementById('spotlightBadge').value?.trim() || 'HOT',
                badge_color: document.getElementById('badgeColor').value || '#EF4444',
                custom_image_url: document.getElementById('customImageUrl').value?.trim() || null,
                
                // Date fields
                start_date: start.toISOString(),
                end_date: end.toISOString(),
                
                // Numeric fields
                amount_paid: parseFloat(document.getElementById('amountPaid').value) || null,
                
                // Status fields
                payment_status: document.getElementById('paymentStatus').value || 'pending',
                payment_method: document.getElementById('paymentMethod').value?.trim() || null,
                transaction_id: document.getElementById('transactionId').value?.trim() || null,
                is_active: document.getElementById('isActive').checked,
                
                // Timestamps
                updated_at: new Date().toISOString()
            };

            // Add created_by only if user exists (UUID field)
            if (currentUser?.id) {
                spotlightData.created_by = currentUser.id;
            }

            const spotlightId = document.getElementById('spotlightId').value;

            // Validate package_id if provided
            if (spotlightData.package_id && !isValidUuid(spotlightData.package_id)) {
                spotlightData.package_id = null; // Set to null if invalid
            }

            console.log('Saving spotlight data:', spotlightData); // For debugging

            let result;
            if (spotlightId) {
                // Update existing spotlight
                result = await sb
                    .from('supplier_spotlights')
                    .update(spotlightData)
                    .eq('id', spotlightId);
            } else {
                // Create new spotlight
                result = await sb
                    .from('supplier_spotlights')
                    .insert([spotlightData]);
            }

            if (result.error) {
                console.error('Supabase error details:', result.error);
                throw new Error(result.error.message);
            }

            showToast(
                spotlightId ? 'Spotlight updated successfully' : 'Spotlight created successfully', 
                'success'
            );
            
            closeSpotlightModal();
            await loadSpotlights();
            await loadStats();

        } catch (error) {
            console.error('Error saving spotlight:', error);
            
            // Handle specific error types
            if (error.message.includes('uuid')) {
                showToast('Invalid UUID format. Please check supplier and package selections.', 'error');
            } else if (error.message.includes('foreign key')) {
                showToast('Invalid reference. Please check supplier and package selections.', 'error');
            } else if (error.message.includes('duplicate')) {
                showToast('A spotlight with these details already exists.', 'error');
            } else {
                showToast('Error saving spotlight: ' + error.message, 'error');
            }
        }
    }

    // ========== VIEW SPOTLIGHT DETAILS ==========
    function viewSpotlight(id) {
        try {
            const spotlight = currentSpotlights.find(s => s.id === id);
            if (!spotlight) {
                showToast('Spotlight not found', 'error');
                return;
            }

            const supplier = getNestedObject(spotlight, 'supplier');
            const pkg = getNestedObject(spotlight, 'package');
            const profile = getNestedObject(supplier, 'profiles');

            const details = `
                <div style="padding: 20px;">
                    <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 20px;">
                        <div class="supplier-avatar" style="width: 60px; height: 60px;">
                            ${profile?.avatar_url ? 
                                `<img src="${profile.avatar_url}" style="width: 100%; height: 100%; object-fit: cover;" alt="${escapeHtml(supplier?.business_name || 'Supplier')}">` :
                                `<span style="font-size: 24px;">${escapeHtml(supplier?.business_name?.charAt(0) || 'S')}</span>`
                            }
                        </div>
                        <div>
                            <h3 style="margin-bottom: 5px;">${escapeHtml(supplier?.business_name || 'Supplier')}</h3>
                            <p style="color: var(--gray-600);">${escapeHtml(supplier?.business_type || '')} • ${escapeHtml(supplier?.warehouse_district || 'Uganda')}</p>
                        </div>
                    </div>
                    
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 0; color: var(--gray-600);">Package:</td>
                            <td style="padding: 8px 0;"><strong>${escapeHtml(pkg?.package_name || 'Custom Package')}</strong></td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: var(--gray-600);">Duration:</td>
                            <td style="padding: 8px 0;">${formatDate(spotlight.start_date)} - ${formatDate(spotlight.end_date)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: var(--gray-600);">Badge:</td>
                            <td style="padding: 8px 0;">
                                <span class="spotlight-badge" style="background: ${spotlight.badge_color || '#EF4444'};">
                                    ${escapeHtml(spotlight.badge_text || 'HOT')}
                                </span>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: var(--gray-600);">Position Priority:</td>
                            <td style="padding: 8px 0;">${spotlight.position_priority || '999'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: var(--gray-600);">Amount Paid:</td>
                            <td style="padding: 8px 0;">UGX ${(spotlight.amount_paid || pkg?.price || 0).toLocaleString()}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: var(--gray-600);">Payment Status:</td>
                            <td style="padding: 8px 0;">
                                <span class="badge ${getPaymentStatusClass(spotlight.payment_status)}">
                                    ${spotlight.payment_status || 'pending'}
                                </span>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: var(--gray-600);">Payment Method:</td>
                            <td style="padding: 8px 0;">${escapeHtml(spotlight.payment_method || '-')}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: var(--gray-600);">Transaction ID:</td>
                            <td style="padding: 8px 0;">${escapeHtml(spotlight.transaction_id || '-')}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: var(--gray-600);">Performance:</td>
                            <td style="padding: 8px 0;">
                                <i class="fas fa-eye"></i> ${spotlight.view_count || 0} views<br>
                                <i class="fas fa-mouse-pointer"></i> ${spotlight.click_count || 0} clicks
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: var(--gray-600);">Created:</td>
                            <td style="padding: 8px 0;">${spotlight.created_at ? new Date(spotlight.created_at).toLocaleString() : '-'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: var(--gray-600);">Last Updated:</td>
                            <td style="padding: 8px 0;">${spotlight.updated_at ? new Date(spotlight.updated_at).toLocaleString() : '-'}</td>
                        </tr>
                        ${spotlight.created_by ? `
                        <tr>
                            <td style="padding: 8px 0; color: var(--gray-600);">Created By:</td>
                            <td style="padding: 8px 0;">Admin ID: ${spotlight.created_by}</td>
                        </tr>
                        ` : ''}
                    </table>
                </div>
            `;

            const detailsContent = document.getElementById('detailsContent');
            if (detailsContent) {
                detailsContent.innerHTML = details;
            }
            
            document.getElementById('detailsModal').classList.add('show');
            
        } catch (error) {
            console.error('Error viewing spotlight:', error);
            showToast('Error loading spotlight details', 'error');
        }
    }

    // ========== DELETE SPOTLIGHT ==========
    function deleteSpotlight(id) {
        const spotlight = currentSpotlights.find(s => s.id === id);
        if (!spotlight) {
            showToast('Spotlight not found', 'error');
            return;
        }

        currentDeleteId = id;
        const supplier = getNestedObject(spotlight, 'supplier');
        
        const deleteMessage = document.getElementById('deleteMessage');
        if (deleteMessage) {
            deleteMessage.innerHTML = `Are you sure you want to delete the spotlight for <strong>${escapeHtml(supplier?.business_name || 'this supplier')}</strong>?`;
        }
        
        document.getElementById('deleteModal').classList.add('show');
    }

    // ========== CONFIRM DELETE ==========
    async function confirmDelete() {
        if (!currentDeleteId) {
            showToast('No spotlight selected for deletion', 'error');
            return;
        }

        try {
            const { error } = await sb
                .from('supplier_spotlights')
                .delete()
                .eq('id', currentDeleteId);

            if (error) throw error;

            showToast('Spotlight deleted successfully', 'success');
            closeDeleteModal();
            await loadSpotlights();
            await loadStats();

        } catch (error) {
            console.error('Error deleting spotlight:', error);
            showToast('Error deleting spotlight: ' + error.message, 'error');
        }
    }

    // ========== SWITCH TAB ==========
    function switchTab(tab) {
        if (!['active', 'pending', 'expired', 'all'].includes(tab)) {
            console.error('Invalid tab:', tab);
            return;
        }

        currentTab = tab;
        
        // Update active tab
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        const tabElement = document.getElementById(`tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`);
        if (tabElement) {
            tabElement.classList.add('active');
        }

        loadSpotlights();
    }

    // ========== RESET FILTERS ==========
    function resetFilters() {
        const searchInput = document.getElementById('searchInput');
        const packageFilter = document.getElementById('packageFilter');
        const statusFilter = document.getElementById('statusFilter');
        
        if (searchInput) searchInput.value = '';
        if (packageFilter) packageFilter.value = '';
        if (statusFilter) statusFilter.value = '';
        
        loadSpotlights();
        showToast('Filters reset', 'success');
    }

    // ========== SETUP SEARCH ==========
    function setupSearch() {
        const searchInput = document.getElementById('searchInput');
        if (!searchInput) return;
        
        let searchTimeout;

        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                loadSpotlights();
            }, 500);
        });
    }

    // ========== SETUP EVENT LISTENERS ==========
    function setupEventListeners() {
        // Close modals on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeAllModals();
            }
        });

        // Close modals on outside click
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                e.target.classList.remove('show');
            }
        });
    }

    // ========== EXPORT SPOTLIGHTS ==========
    function exportSpotlights() {
        try {
            if (!currentSpotlights || currentSpotlights.length === 0) {
                showToast('No spotlights to export', 'warning');
                return;
            }

            // Create CSV
            const headers = ['ID', 'Supplier', 'Package', 'Start Date', 'End Date', 'Badge', 'Position', 'Amount Paid', 'Payment Status', 'Views', 'Clicks', 'Status'];
            const rows = currentSpotlights.map(s => {
                const supplier = getNestedObject(s, 'supplier');
                const pkg = getNestedObject(s, 'package');
                
                return [
                    s.id,
                    supplier?.business_name || '',
                    pkg?.package_name || 'Custom',
                    s.start_date ? new Date(s.start_date).toLocaleDateString() : '',
                    s.end_date ? new Date(s.end_date).toLocaleDateString() : '',
                    s.badge_text || 'HOT',
                    s.position_priority || '999',
                    s.amount_paid || pkg?.price || 0,
                    s.payment_status || '',
                    s.view_count || 0,
                    s.click_count || 0,
                    s.is_active ? 'Active' : 'Inactive'
                ];
            });

            const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
            
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `supplier-spotlights-${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            
            window.URL.revokeObjectURL(url);
            showToast('Spotlights exported successfully', 'success');
            
        } catch (error) {
            console.error('Error exporting spotlights:', error);
            showToast('Error exporting spotlights', 'error');
        }
    }

    // ========== HELPER FUNCTIONS ==========

    // Validate UUID format
    function isValidUuid(uuid) {
        if (!uuid) return false;
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return uuidRegex.test(uuid);
    }

    // Validate UUID field (return null if invalid)
    function validateUuidField(value) {
        if (!value || value === '') return null;
        return isValidUuid(value) ? value : null;
    }

    // Safely get nested object
    function getNestedObject(obj, path) {
        if (!obj || !path) return null;
        const value = obj[path];
        return Array.isArray(value) ? value[0] : value;
    }

    // Get status badge HTML
    function getStatusBadge(spotlight, endDate, now) {
        if (spotlight.payment_status === 'pending') {
            return '<span class="badge badge-warning">Pending Payment</span>';
        } else if (spotlight.payment_status === 'failed') {
            return '<span class="badge badge-danger">Payment Failed</span>';
        } else if (endDate < now) {
            return '<span class="badge badge-danger">Expired</span>';
        } else if (spotlight.is_active) {
            return '<span class="badge badge-success">Active</span>';
        } else {
            return '<span class="badge badge-danger">Inactive</span>';
        }
    }

    // Get payment status class
    function getPaymentStatusClass(status) {
        switch(status) {
            case 'paid': return 'badge-success';
            case 'pending': return 'badge-warning';
            case 'failed': return 'badge-danger';
            default: return 'badge-warning';
        }
    }

    // Show loading state
    function showLoading(show) {
        const loadingSpinner = document.getElementById('loadingSpinner');
        const spotlightsTable = document.getElementById('spotlightsTable');
        
        if (loadingSpinner) loadingSpinner.style.display = show ? 'block' : 'none';
        if (spotlightsTable) spotlightsTable.style.display = show ? 'none' : 'block';
    }

    // Show empty state with custom message
    function showEmptyState(type = 'empty', message = 'No spotlights found') {
        const emptyState = document.getElementById('emptyState');
        if (!emptyState) return;

        const icons = {
            empty: 'fa-fire',
            error: 'fa-exclamation-circle',
            search: 'fa-search'
        };

        emptyState.innerHTML = `
            <i class="fas ${icons[type] || 'fa-fire'}" style="font-size: 48px; margin-bottom: 15px; color: var(--gray-400);"></i>
            <h3>${type === 'error' ? 'Error' : 'No spotlights found'}</h3>
            <p>${message}</p>
            <button class="btn btn-primary" style="margin-top: 15px;" onclick="spotlightManager.openCreateSpotlightModal()">
                <i class="fas fa-plus"></i> Create Spotlight
            </button>
        `;
    }

    // Format date
    function formatDate(dateString) {
        if (!dateString) return 'N/A';
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString();
        } catch {
            return 'Invalid Date';
        }
    }

    // Escape HTML
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Set element text safely
    function setElementText(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    }

    // Show toast notification
    function showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        if (!toast) return;
        
        toast.textContent = message;
        toast.className = `toast show ${type}`;
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    // Close all modals
    function closeAllModals() {
        const modals = ['spotlightModal', 'detailsModal', 'deleteModal'];
        modals.forEach(id => {
            const modal = document.getElementById(id);
            if (modal) modal.classList.remove('show');
        });
        currentDeleteId = null;
    }

    // Modal Close Functions
    function closeSpotlightModal() {
        const modal = document.getElementById('spotlightModal');
        if (modal) modal.classList.remove('show');
    }

    function closeDetailsModal() {
        const modal = document.getElementById('detailsModal');
        if (modal) modal.classList.remove('show');
    }

    function closeDeleteModal() {
        const modal = document.getElementById('deleteModal');
        if (modal) modal.classList.remove('show');
        currentDeleteId = null;
    }

    // ========== PUBLIC API ==========
    return {
        // Data loading
        loadSpotlights,
        
        // Modal operations
        openCreateSpotlightModal,
        selectSupplier,
        updatePackageDetails,
        editSpotlight,
        saveSpotlight,
        viewSpotlight,
        deleteSpotlight,
        confirmDelete,
        
        // Filters and tabs
        switchTab,
        resetFilters,
        
        // Export
        exportSpotlights,
        
        // Modal close functions
        closeSpotlightModal,
        closeDetailsModal,
        closeDeleteModal
    };
})();