// ========== SPOTLIGHT PRICING ADMIN JAVASCRIPT ==========
const spotlightPricingManager = (function() {
    // Supabase Configuration
    const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';
    
    const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // ========== STATE ==========
    let currentUser = null;
    let packages = [];
    let filteredPackages = [];
    let currentDeleteId = null;
    let isLoading = false;

    // ========== SPOTLIGHT TYPES ==========
    const SPOTLIGHT_TYPES = {
        'featured_deals': 'Featured Deals',
        'trending_now': 'Trending Now',
        'editor_picks': 'Editor Picks',
        'new_arrivals': 'New Arrivals',
        'budget_finds': 'Budget Finds',
        'premium_listings': 'Premium Listings',
        'local_favorites': 'Local Favorites',
        'verified_sellers': 'Verified Sellers'
    };

    // ========== INITIALIZATION ==========
    document.addEventListener('DOMContentLoaded', async () => {
        try {
            await checkAuth();
            await loadPackages();
            setupEventListeners();
            hideLoading();
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
                    window.location.href = 'admin-login.html?redirect=admin-spotlight-pricing.html';
                }, 2000);
                return;
            }
            
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
                return;
            }

            currentUser = { ...user, ...profile };

        } catch (error) {
            console.error('Auth check error:', error);
            showToast('Authentication error', 'error');
        }
    }

    // ========== LOAD PACKAGES ==========
    async function loadPackages() {
        isLoading = true;
        showLoading(true);

        try {
            const { data, error } = await sb
                .from('supplier_spotlight_packages')
                .select('*')
                .order('display_priority', { ascending: true })
                .order('price', { ascending: true });

            if (error) throw error;

            packages = data || [];
            filteredPackages = packages;
            
            renderPackages();
            updateStats();

        } catch (error) {
            console.error('Error loading packages:', error);
            showToast('Error loading packages: ' + error.message, 'error');
            showEmptyState('error', 'Failed to load packages');
        } finally {
            isLoading = false;
            showLoading(false);
        }
    }

    // ========== UPDATE STATS ==========
    function updateStats() {
        const total = packages.length;
        const active = packages.filter(p => p.is_active).length;
        const prices = packages.map(p => p.price).filter(p => p);
        
        const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
        const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

        setElementText('totalPackages', total);
        setElementText('activePackages', active);
        setElementText('minPrice', `UGX ${minPrice.toLocaleString()}`);
        setElementText('maxPrice', `UGX ${maxPrice.toLocaleString()}`);
    }

    // ========== FILTER PACKAGES ==========
    function filterPackages() {
        const searchTerm = document.getElementById('searchInput')?.value?.toLowerCase().trim() || '';
        const statusFilter = document.getElementById('statusFilter')?.value || 'all';
        const typeFilter = document.getElementById('typeFilter')?.value || 'all';

        filteredPackages = packages.filter(pkg => {
            // Search filter
            if (searchTerm) {
                const nameMatch = pkg.package_name?.toLowerCase().includes(searchTerm);
                const descMatch = pkg.description?.toLowerCase().includes(searchTerm);
                
                if (!nameMatch && !descMatch) {
                    return false;
                }
            }

            // Status filter
            if (statusFilter === 'active' && !pkg.is_active) return false;
            if (statusFilter === 'inactive' && pkg.is_active) return false;

            // Type filter
            if (typeFilter !== 'all' && pkg.spotlight_type !== typeFilter) return false;

            return true;
        });

        renderPackages();
    }

    // ========== RENDER PACKAGES ==========
    function renderPackages() {
        const tbody = document.getElementById('packagesTableBody');
        const table = document.getElementById('packagesTable');
        const emptyState = document.getElementById('emptyState');

        if (!tbody) return;

        if (filteredPackages.length === 0) {
            if (table) table.style.display = 'none';
            if (emptyState) emptyState.style.display = 'block';
            return;
        }

        if (table) table.style.display = 'block';
        if (emptyState) emptyState.style.display = 'none';

        tbody.innerHTML = filteredPackages.map(pkg => {
            // Parse benefits if it's a JSON string
            let benefits = [];
            try {
                benefits = typeof pkg.benefits === 'string' ? JSON.parse(pkg.benefits) : (pkg.benefits || []);
            } catch {
                benefits = pkg.benefits || [];
            }

            return `
            <tr>
                <td>
                    <div class="package-name">${escapeHtml(pkg.package_name)}</div>
                    ${pkg.description ? `<div class="package-description">${escapeHtml(pkg.description.substring(0, 50))}${pkg.description.length > 50 ? '...' : ''}</div>` : ''}
                </td>
                <td>
                    ${pkg.spotlight_type ? 
                        `<span class="spotlight-type">${escapeHtml(SPOTLIGHT_TYPES[pkg.spotlight_type] || pkg.spotlight_type)}</span>` : 
                        '<span class="badge badge-info">Standard</span>'}
                </td>
                <td>
                    <span class="price">UGX ${(pkg.price || 0).toLocaleString()}</span>
                    ${pkg.daily_rate ? `<div class="price-small">Daily: UGX ${pkg.daily_rate.toLocaleString()}</div>` : ''}
                    ${pkg.weekly_rate ? `<div class="price-small">Weekly: UGX ${pkg.weekly_rate.toLocaleString()}</div>` : ''}
                    ${pkg.monthly_rate ? `<div class="price-small">Monthly: UGX ${pkg.monthly_rate.toLocaleString()}</div>` : ''}
                </td>
                <td>
                    <span>${pkg.duration_days || 1} days</span>
                    ${pkg.weekly_days ? `<div class="price-small">Weekly: ${pkg.weekly_days} days</div>` : ''}
                    ${pkg.monthly_days ? `<div class="price-small">Monthly: ${pkg.monthly_days} days</div>` : ''}
                </td>
                <td>
                    <span class="badge ${pkg.display_priority <= 3 ? 'badge-success' : 'badge-info'}">
                        Priority ${pkg.display_priority || 999}
                    </span>
                    <div class="price-small">Max ${pkg.max_suppliers_per_day || 10}/day</div>
                </td>
                <td>
                    <div class="benefits-list">
                        ${benefits.slice(0, 2).map(b => `<span class="badge badge-info">${escapeHtml(b)}</span>`).join(' ')}
                        ${benefits.length > 2 ? `<span class="badge">+${benefits.length - 2}</span>` : ''}
                    </div>
                </td>
                <td>
                    <span class="badge ${pkg.is_active ? 'badge-success' : 'badge-danger'}">
                        ${pkg.is_active ? 'Active' : 'Inactive'}
                    </span>
                    ${pkg.includes_verification_badge ? 
                        '<div class="price-small"><i class="fas fa-check-circle" style="color: #10B981;"></i> Verification Badge</div>' : ''}
                    ${pkg.includes_featured_label ? 
                        '<div class="price-small"><i class="fas fa-star" style="color: #F59E0B;"></i> Featured Label</div>' : ''}
                </td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-sm btn-icon" onclick="spotlightPricingManager.editPackage(${pkg.id})" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-icon" onclick="spotlightPricingManager.toggleStatus(${pkg.id})" 
                                title="${pkg.is_active ? 'Deactivate' : 'Activate'}">
                            <i class="fas ${pkg.is_active ? 'fa-toggle-on' : 'fa-toggle-off'}" 
                               style="color: ${pkg.is_active ? '#10B981' : '#6B7280'};"></i>
                        </button>
                        <button class="btn btn-sm btn-icon btn-danger" onclick="spotlightPricingManager.deletePackage(${pkg.id})" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `}).join('');
    }

    // ========== OPEN CREATE MODAL ==========
    function openCreateModal() {
        document.getElementById('modalTitle').innerHTML = '<i class="fas fa-tag"></i> Create Spotlight Package';
        document.getElementById('packageForm').reset();
        document.getElementById('packageId').value = '';
        document.getElementById('isActive').checked = true;
        document.getElementById('includesVerificationBadge').checked = false;
        document.getElementById('includesFeaturedLabel').checked = true;
        document.getElementById('displayPriority').value = '3';
        document.getElementById('maxSuppliersPerDay').value = '10';
        document.getElementById('currency').value = 'UGX';
        document.getElementById('badgeColor').value = '#EF4444';
        document.getElementById('badgeText').value = 'HOT';
        document.getElementById('durationDays').value = '7';
        
        openModal('packageModal');
    }

    // ========== EDIT PACKAGE ==========
    function editPackage(id) {
        const pkg = packages.find(p => p.id === id);
        if (!pkg) {
            showToast('Package not found', 'error');
            return;
        }

        document.getElementById('modalTitle').innerHTML = '<i class="fas fa-edit"></i> Edit Spotlight Package';
        document.getElementById('packageId').value = pkg.id;
        document.getElementById('packageName').value = pkg.package_name || '';
        document.getElementById('spotlightType').value = pkg.spotlight_type || '';
        document.getElementById('price').value = pkg.price || '';
        document.getElementById('dailyRate').value = pkg.daily_rate || '';
        document.getElementById('weeklyRate').value = pkg.weekly_rate || '';
        document.getElementById('monthlyRate').value = pkg.monthly_rate || '';
        document.getElementById('currency').value = pkg.currency || 'UGX';
        document.getElementById('durationDays').value = pkg.duration_days || 7;
        document.getElementById('weeklyDays').value = pkg.weekly_days || 7;
        document.getElementById('monthlyDays').value = pkg.monthly_days || 30;
        document.getElementById('displayPriority').value = pkg.display_priority || 3;
        document.getElementById('maxSuppliersPerDay').value = pkg.max_suppliers_per_day || 10;
        document.getElementById('maxAdsPerDay').value = pkg.max_ads_per_day || 10;
        document.getElementById('description').value = pkg.description || '';
        document.getElementById('badgeText').value = pkg.badge_text || 'HOT';
        document.getElementById('badgeColor').value = pkg.badge_color || '#EF4444';
        document.getElementById('includesVerificationBadge').checked = pkg.includes_verification_badge || false;
        document.getElementById('includesFeaturedLabel').checked = pkg.includes_featured_label !== false;
        document.getElementById('includesVerification').checked = pkg.includes_verification || false;
        document.getElementById('isActive').checked = pkg.is_active !== false;
        
        // Handle benefits array
        const benefitsInput = document.getElementById('benefits');
        if (benefitsInput) {
            try {
                const benefits = typeof pkg.benefits === 'string' ? JSON.parse(pkg.benefits) : (pkg.benefits || []);
                benefitsInput.value = benefits.join('\n');
            } catch {
                benefitsInput.value = '';
            }
        }

        openModal('packageModal');
    }

    // ========== SAVE PACKAGE ==========
    async function savePackage(event) {
        event.preventDefault();

        try {
            // Validate required fields
            const packageName = document.getElementById('packageName').value.trim();
            const price = parseFloat(document.getElementById('price').value);
            const durationDays = parseInt(document.getElementById('durationDays').value);

            if (!packageName) {
                showToast('Package name is required', 'warning');
                return;
            }

            if (!price || price <= 0) {
                showToast('Valid price is required', 'warning');
                return;
            }

            if (!durationDays || durationDays <= 0) {
                showToast('Valid duration is required', 'warning');
                return;
            }

            // Process benefits
            const benefitsText = document.getElementById('benefits')?.value || '';
            const benefits = benefitsText.split('\n')
                .map(b => b.trim())
                .filter(b => b.length > 0);

            // Build package data matching your schema
            const packageData = {
                // Required fields
                package_name: packageName,
                price: price,
                duration_days: durationDays,
                currency: document.getElementById('currency').value,
                
                // Existing optional fields
                description: document.getElementById('description').value.trim() || null,
                display_priority: parseInt(document.getElementById('displayPriority').value) || 3,
                max_suppliers_per_day: parseInt(document.getElementById('maxSuppliersPerDay').value) || 10,
                badge_text: document.getElementById('badgeText').value || 'HOT',
                badge_color: document.getElementById('badgeColor').value || '#EF4444',
                includes_verification_badge: document.getElementById('includesVerificationBadge').checked,
                includes_featured_label: document.getElementById('includesFeaturedLabel').checked,
                benefits: benefits,
                is_active: document.getElementById('isActive').checked,
                
                // New fields (optional)
                spotlight_type: document.getElementById('spotlightType').value || null,
                daily_rate: parseFloat(document.getElementById('dailyRate').value) || null,
                weekly_rate: parseFloat(document.getElementById('weeklyRate').value) || null,
                monthly_rate: parseFloat(document.getElementById('monthlyRate').value) || null,
                weekly_days: parseInt(document.getElementById('weeklyDays').value) || 7,
                monthly_days: parseInt(document.getElementById('monthlyDays').value) || 30,
                max_ads_per_day: parseInt(document.getElementById('maxAdsPerDay').value) || 10,
                includes_verification: document.getElementById('includesVerification').checked,
                
                // Tracking
                updated_at: new Date().toISOString()
            };

            // Add created_by for new records
            const packageId = document.getElementById('packageId').value;
            if (!packageId && currentUser?.id) {
                packageData.created_by = currentUser.id;
            }

            let result;
            if (packageId) {
                // Update existing package
                result = await sb
                    .from('supplier_spotlight_packages')
                    .update(packageData)
                    .eq('id', packageId);
            } else {
                // Insert new package
                packageData.created_at = new Date().toISOString();
                result = await sb
                    .from('supplier_spotlight_packages')
                    .insert([packageData]);
            }

            if (result.error) throw result.error;

            showToast(
                packageId ? 'Package updated successfully' : 'Package created successfully', 
                'success'
            );
            
            closeModal();
            await loadPackages();

        } catch (error) {
            console.error('Error saving package:', error);
            showToast('Error saving package: ' + error.message, 'error');
        }
    }

    // ========== TOGGLE STATUS ==========
    async function toggleStatus(id) {
        const pkg = packages.find(p => p.id === id);
        if (!pkg) return;

        const newStatus = !pkg.is_active;

        try {
            const { error } = await sb
                .from('supplier_spotlight_packages')
                .update({ 
                    is_active: newStatus,
                    updated_at: new Date().toISOString()
                })
                .eq('id', id);

            if (error) throw error;

            showToast(`Package ${newStatus ? 'activated' : 'deactivated'}`, 'success');
            await loadPackages();

        } catch (error) {
            console.error('Error toggling status:', error);
            showToast('Error updating status', 'error');
        }
    }

    // ========== DELETE PACKAGE ==========
    function deletePackage(id) {
        const pkg = packages.find(p => p.id === id);
        if (!pkg) return;

        currentDeleteId = id;
        document.getElementById('deleteMessage').innerHTML = 
            `Are you sure you want to delete <strong>${escapeHtml(pkg.package_name)}</strong>?`;
        openModal('deleteModal');
    }

    // ========== CONFIRM DELETE ==========
    async function confirmDelete() {
        if (!currentDeleteId) return;

        try {
            const { error } = await sb
                .from('supplier_spotlight_packages')
                .delete()
                .eq('id', currentDeleteId);

            if (error) throw error;

            showToast('Package deleted successfully', 'success');
            closeDeleteModal();
            await loadPackages();

        } catch (error) {
            console.error('Error deleting package:', error);
            showToast('Error deleting package: ' + error.message, 'error');
        }
    }

    // ========== EXPORT PRICING ==========
    function exportPricing() {
        try {
            if (packages.length === 0) {
                showToast('No packages to export', 'warning');
                return;
            }

            const headers = ['ID', 'Package Name', 'Spotlight Type', 'Price', 'Daily Rate', 'Weekly Rate', 
                            'Monthly Rate', 'Duration (Days)', 'Currency', 'Display Priority', 
                            'Max Suppliers/Day', 'Max Ads/Day', 'Badge', 'Includes Verification Badge', 
                            'Includes Featured Label', 'Includes Verification', 'Status', 'Created'];
            
            const rows = packages.map(p => [
                p.id,
                p.package_name,
                p.spotlight_type || 'Standard',
                p.price || 0,
                p.daily_rate || 0,
                p.weekly_rate || 0,
                p.monthly_rate || 0,
                p.duration_days || 1,
                p.currency || 'UGX',
                p.display_priority || 999,
                p.max_suppliers_per_day || 10,
                p.max_ads_per_day || 10,
                `${p.badge_text || 'HOT'} (${p.badge_color || '#EF4444'})`,
                p.includes_verification_badge ? 'Yes' : 'No',
                p.includes_featured_label ? 'Yes' : 'No',
                p.includes_verification ? 'Yes' : 'No',
                p.is_active ? 'Active' : 'Inactive',
                p.created_at ? new Date(p.created_at).toLocaleDateString() : ''
            ]);

            const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
            
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `spotlight-pricing-${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            
            window.URL.revokeObjectURL(url);
            showToast('Pricing exported successfully', 'success');

        } catch (error) {
            console.error('Error exporting pricing:', error);
            showToast('Error exporting pricing', 'error');
        }
    }

    // ========== SETUP EVENT LISTENERS ==========
    function setupEventListeners() {
        // Search input
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            let searchTimeout;
            searchInput.addEventListener('input', () => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(filterPackages, 500);
            });
        }

        // Filters
        const statusFilter = document.getElementById('statusFilter');
        const typeFilter = document.getElementById('typeFilter');

        if (statusFilter) {
            statusFilter.addEventListener('change', filterPackages);
        }
        if (typeFilter) {
            typeFilter.addEventListener('change', filterPackages);
        }

        // Close modal on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeModal();
                closeDeleteModal();
            }
        });

        // Close modal on outside click
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                closeModal();
                closeDeleteModal();
            }
        });
    }

    // ========== UTILITIES ==========

    function showLoading(show) {
        const spinner = document.getElementById('loadingSpinner');
        const table = document.getElementById('packagesTable');
        const emptyState = document.getElementById('emptyState');

        if (spinner) spinner.style.display = show ? 'block' : 'none';
        if (table && !show && filteredPackages.length > 0) table.style.display = 'block';
        if (emptyState && !show && filteredPackages.length === 0) emptyState.style.display = 'block';
    }

    function hideLoading() {
        showLoading(false);
    }

    function showEmptyState(type = 'empty', message = 'No packages found') {
        const emptyState = document.getElementById('emptyState');
        if (!emptyState) return;

        const icons = {
            empty: 'fa-tags',
            error: 'fa-exclamation-circle',
            search: 'fa-search'
        };

        emptyState.innerHTML = `
            <i class="fas ${icons[type] || 'fa-tags'}" style="font-size: 48px; margin-bottom: 16px; color: var(--gray-400);"></i>
            <h3>${type === 'error' ? 'Error' : 'No packages found'}</h3>
            <p>${message}</p>
            <button class="btn btn-primary" onclick="spotlightPricingManager.openCreateModal()">
                <i class="fas fa-plus"></i> Create Package
            </button>
        `;
        emptyState.style.display = 'block';
    }

    function openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.add('show');
    }

    function closeModal() {
        const modal = document.getElementById('packageModal');
        if (modal) modal.classList.remove('show');
    }

    function closeDeleteModal() {
        const modal = document.getElementById('deleteModal');
        if (modal) modal.classList.remove('show');
        currentDeleteId = null;
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
        openCreateModal,
        editPackage,
        savePackage,
        toggleStatus,
        deletePackage,
        confirmDelete,
        exportPricing,
        closeModal,
        closeDeleteModal
    };
})();

// Assign to window for global access
window.spotlightPricingManager = spotlightPricingManager;