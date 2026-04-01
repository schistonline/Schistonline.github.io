// ========== ADMIN PRODUCTS JAVASCRIPT ==========
const adminProducts = (function() {
    // Supabase Configuration
    const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';
    
    const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // State
    let currentUser = null;
    let currentProductId = null;
    let products = [];
    let filteredProducts = [];
    let suppliers = [];
    let categories = [];
    let currentPage = 1;
    const itemsPerPage = 20;
    let totalCount = 0;

    // ========== HELPER FUNCTIONS ==========
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function formatDate(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast ${type}`;
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    function getStatusBadgeClass(status) {
        switch(status) {
            case 'active': return 'badge-success';
            case 'draft': return 'badge-warning';
            case 'sold': return 'badge-info';
            case 'expired': return 'badge-warning';
            case 'banned': return 'badge-danger';
            default: return 'badge-warning';
        }
    }

    async function getClientIP() {
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            return data.ip;
        } catch {
            return null;
        }
    }

    // ========== AUTHENTICATION ==========
    async function checkAdmin() {
        try {
            const { data: { user } } = await sb.auth.getUser();
            
            if (!user) {
                window.location.href = 'login.html?redirect=admin-products.html';
                return;
            }

            const { data: profile, error } = await sb
                .from('profiles')
                .select('is_admin, admin_role')
                .eq('id', user.id)
                .single();

            if (error || !profile?.is_admin) {
                window.location.href = 'index.html';
                return;
            }

            currentUser = user;
            
            await sb.from('admin_actions').insert({
                admin_id: user.id,
                action_type: 'login',
                ip_address: await getClientIP()
            });

            await Promise.all([
                loadStats(),
                loadSuppliers(),
                loadCategories(),
                loadProducts()
            ]);

        } catch (error) {
            console.error('Error checking admin:', error);
            window.location.href = 'index.html';
        }
    }

    // ========== STATS ==========
    async function loadStats() {
        try {
            // Total products
            const { count: total, error: totalError } = await sb
                .from('ads')
                .select('*', { count: 'exact', head: true });
            
            if (!totalError) {
                document.getElementById('totalProducts').textContent = total || 0;
            }

            // Active products
            const { count: active, error: activeError } = await sb
                .from('ads')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'active');
            
            if (!activeError) {
                document.getElementById('activeProducts').textContent = active || 0;
            }

            // Bulk products
            const { count: bulk, error: bulkError } = await sb
                .from('ads')
                .select('*', { count: 'exact', head: true })
                .eq('is_bulk_only', true);
            
            if (!bulkError) {
                document.getElementById('bulkProducts').textContent = bulk || 0;
            }

            // Low stock products
            const { data: lowStock, error: lowStockError } = await sb
                .from('ads')
                .select('id')
                .not('stock_quantity', 'is', null)
                .lt('stock_quantity', 10);
            
            if (!lowStockError) {
                document.getElementById('lowStockProducts').textContent = lowStock?.length || 0;
            }

        } catch (error) {
            console.error('Error loading stats:', error);
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
                    profile_id,
                    profiles:profile_id (
                        full_name
                    )
                `)
                .order('business_name');

            if (error) throw error;
            
            suppliers = data || [];
            
            const supplierSelect = document.getElementById('supplierFilter');
            suppliers.forEach(supplier => {
                const option = document.createElement('option');
                option.value = supplier.id;
                option.textContent = supplier.business_name;
                supplierSelect.appendChild(option);
            });

        } catch (error) {
            console.error('Error loading suppliers:', error);
        }
    }

    // ========== LOAD CATEGORIES ==========
    async function loadCategories() {
        try {
            const { data, error } = await sb
                .from('categories')
                .select('id, name')
                .eq('is_active', true)
                .order('name');

            if (error) throw error;
            
            categories = data || [];
            
            const categorySelect = document.getElementById('categoryFilter');
            categories.forEach(category => {
                const option = document.createElement('option');
                option.value = category.id;
                option.textContent = category.name;
                categorySelect.appendChild(option);
            });

        } catch (error) {
            console.error('Error loading categories:', error);
        }
    }

    // ========== LOAD PRODUCTS ==========
    async function loadProducts(page = 1) {
        currentPage = page;
        
        try {
            // Build query
            let query = sb
                .from('ads')
                .select(`
                    *,
                    seller:profiles!ads_seller_id_fkey (
                        full_name,
                        is_verified
                    ),
                    supplier:suppliers!ads_supplier_id_fkey (
                        id,
                        business_name,
                        verification_status
                    ),
                    category:categories!ads_category_id_fkey (
                        id,
                        name
                    ),
                    subcategory:categories!ads_subcategory_id_fkey (
                        id,
                        name
                    )
                `, { count: 'exact' });

            // Apply filters
            const searchTerm = document.getElementById('searchInput').value;
            if (searchTerm) {
                query = query.or(`title.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`);
            }

            const supplierId = document.getElementById('supplierFilter').value;
            if (supplierId) {
                query = query.eq('supplier_id', supplierId);
            }

            const categoryId = document.getElementById('categoryFilter').value;
            if (categoryId) {
                query = query.eq('category_id', parseInt(categoryId));
            }

            const status = document.getElementById('statusFilter').value;
            if (status) {
                query = query.eq('status', status);
            }

            const type = document.getElementById('typeFilter').value;
            if (type === 'bulk') {
                query = query.eq('is_bulk_only', true);
            } else if (type === 'wholesale') {
                query = query.not('wholesale_price', 'is', null);
            }

            const stockStatus = document.getElementById('stockFilter').value;
            if (stockStatus === 'low') {
                query = query
                    .not('stock_quantity', 'is', null)
                    .lt('stock_quantity', 10);
            } else if (stockStatus === 'out') {
                query = query.or('stock_quantity.eq.0,stock_quantity.is.null');
            } else if (stockStatus === 'in') {
                query = query
                    .not('stock_quantity', 'is', null)
                    .gt('stock_quantity', 0);
            }

            // Get total count
            const { count, error: countError } = await query;
            if (countError) throw countError;
            totalCount = count || 0;

            // Apply pagination
            const from = (page - 1) * itemsPerPage;
            const to = from + itemsPerPage - 1;

            const { data, error } = await query
                .order('created_at', { ascending: false })
                .range(from, to);

            if (error) throw error;

            products = data || [];
            filteredProducts = products;
            
            renderProducts();
            updatePagination();

        } catch (error) {
            console.error('Error loading products:', error);
            showToast('Error loading products', 'error');
            
            document.getElementById('productsTableBody').innerHTML = `
                <tr>
                    <td colspan="9" style="text-align: center; padding: 40px; color: #ef4444;">
                        <i class="fas fa-exclamation-circle" style="font-size: 32px; margin-bottom: 12px;"></i>
                        <div>Error loading products. Please try again.</div>
                    </td>
                </tr>
            `;
        }
    }

    // ========== RENDER PRODUCTS ==========
    function renderProducts() {
        const tbody = document.getElementById('productsTableBody');
        
        if (filteredProducts.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align: center; padding: 40px; color: #6b7280;">
                        <i class="fas fa-box-open" style="font-size: 32px; margin-bottom: 12px;"></i>
                        <div>No products found</div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = filteredProducts.map(product => {
            const imageUrl = product.image_urls?.[0] || 'https://via.placeholder.com/48?text=No+Image';
            const isLowStock = product.stock_quantity && product.stock_quantity <= (product.low_stock_threshold || 10);
            const stockPercentage = product.stock_quantity && product.low_stock_threshold 
                ? Math.min(100, (product.stock_quantity / product.low_stock_threshold) * 100)
                : 100;

            return `
                <tr>
                    <td>
                        <div class="product-info">
                            <div class="product-thumb">
                                <img src="${imageUrl}" alt="${escapeHtml(product.title)}">
                            </div>
                            <div class="product-details">
                                <span class="product-title">${escapeHtml(product.title)}</span>
                                <span class="product-id">ID: ${product.id}</span>
                            </div>
                        </div>
                    </td>
                    <td>
                        <div class="supplier-info">
                            <span class="supplier-name">${escapeHtml(product.supplier?.business_name || product.seller?.full_name || 'Unknown')}</span>
                            ${product.supplier?.verification_status === 'verified' ? 
                                '<span class="supplier-verified"><i class="fas fa-check-circle"></i> Verified</span>' : 
                                '<span style="color: #f59e0b; font-size: 11px;">Pending Verification</span>'}
                        </div>
                    </td>
                    <td>
                        <span>${escapeHtml(product.category?.name || 'Uncategorized')}</span>
                        ${product.subcategory?.name ? `<br><small style="color: #6b7280;">${escapeHtml(product.subcategory.name)}</small>` : ''}
                    </td>
                    <td>
                        <div class="price-info">
                            <span class="price-regular">UGX ${parseInt(product.price || 0).toLocaleString()}</span>
                            ${product.wholesale_price ? 
                                `<span class="price-wholesale">Wholesale: UGX ${parseInt(product.wholesale_price).toLocaleString()}</span>` : ''}
                        </div>
                    </td>
                    <td>
                        <div class="stock-info">
                            <div class="stock-level">
                                <span>${product.stock_quantity || 0} units</span>
                                ${product.stock_quantity ? `
                                    <div class="stock-bar">
                                        <div class="stock-fill ${isLowStock ? 'low' : ''}" style="width: ${stockPercentage}%"></div>
                                    </div>
                                ` : ''}
                            </div>
                            ${isLowStock ? '<span style="color: #ef4444; font-size: 11px;"><i class="fas fa-exclamation-triangle"></i> Low Stock</span>' : ''}
                            ${product.moq ? `<span style="color: #6b7280; font-size: 11px;">MOQ: ${product.moq}</span>` : ''}
                        </div>
                    </td>
                    <td>
                        <span class="badge ${getStatusBadgeClass(product.status)}">
                            ${product.status || 'unknown'}
                        </span>
                    </td>
                    <td>
                        ${product.is_bulk_only ? 
                            '<span class="badge badge-purple"><i class="fas fa-boxes"></i> Bulk</span>' : 
                            product.wholesale_price ? 
                            '<span class="badge badge-info"><i class="fas fa-tag"></i> Wholesale</span>' : 
                            '<span class="badge badge-success">Regular</span>'}
                    </td>
                    <td>
                        <span>${formatDate(product.created_at)}</span>
                    </td>
                    <td>
                        <div class="actions">
                            <a href="javascript:void(0)" onclick="adminProducts.viewProduct(${product.id})" class="action-btn" title="View">
                                <i class="fas fa-eye"></i>
                            </a>
                            <a href="javascript:void(0)" onclick="adminProducts.editProduct(${product.id})" class="action-btn" title="Edit">
                                <i class="fas fa-edit"></i>
                            </a>
                            <label class="status-toggle" title="Toggle Status">
                                <input type="checkbox" ${product.status === 'active' ? 'checked' : ''} 
                                       onchange="adminProducts.toggleProductStatus(${product.id}, this.checked)">
                                <span class="toggle-slider"></span>
                            </label>
                            <a href="javascript:void(0)" onclick="adminProducts.deleteProduct(${product.id})" class="action-btn delete" title="Delete">
                                <i class="fas fa-trash"></i>
                            </a>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // ========== PAGINATION ==========
    function updatePagination() {
        const totalPages = Math.ceil(totalCount / itemsPerPage);
        
        document.getElementById('paginationInfo').innerHTML = 
            `Showing ${((currentPage - 1) * itemsPerPage) + 1} to ${Math.min(currentPage * itemsPerPage, totalCount)} of ${totalCount} products`;

        let controls = '';
        if (currentPage > 1) {
            controls += `<button class="page-btn" onclick="adminProducts.changePage(${currentPage - 1})"><i class="fas fa-chevron-left"></i></button>`;
        }

        for (let i = Math.max(1, currentPage - 2); i <= Math.min(totalPages, currentPage + 2); i++) {
            controls += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="adminProducts.changePage(${i})">${i}</button>`;
        }

        if (currentPage < totalPages) {
            controls += `<button class="page-btn" onclick="adminProducts.changePage(${currentPage + 1})"><i class="fas fa-chevron-right"></i></button>`;
        }

        document.getElementById('paginationControls').innerHTML = controls;
    }

    function changePage(page) {
        loadProducts(page);
    }

    // ========== FILTERS ==========
    function applyFilters() {
        currentPage = 1;
        loadProducts(1);
    }

    function resetFilters() {
        document.getElementById('searchInput').value = '';
        document.getElementById('supplierFilter').value = '';
        document.getElementById('categoryFilter').value = '';
        document.getElementById('statusFilter').value = '';
        document.getElementById('typeFilter').value = '';
        document.getElementById('stockFilter').value = '';
        applyFilters();
    }

    // ========== PRODUCT ACTIONS ==========
    async function viewProduct(productId) {
        try {
            const { data: product, error } = await sb
                .from('ads')
                .select(`
                    *,
                    seller:profiles!ads_seller_id_fkey (
                        full_name,
                        email,
                        phone,
                        is_verified
                    ),
                    supplier:suppliers!ads_supplier_id_fkey (
                        business_name,
                        business_phone,
                        business_email,
                        verification_status
                    ),
                    category:categories!ads_category_id_fkey (
                        name
                    ),
                    subcategory:categories!ads_subcategory_id_fkey (
                        name
                    ),
                    bulk_pricing (*)
                `)
                .eq('id', productId)
                .single();

            if (error) throw error;

            currentProductId = productId;

            const modalBody = document.getElementById('productModalBody');
            modalBody.innerHTML = `
                <div class="image-gallery">
                    ${product.image_urls?.map(url => `
                        <div class="gallery-image">
                            <img src="${url}" alt="${escapeHtml(product.title)}">
                        </div>
                    `).join('') || '<p>No images available</p>'}
                </div>

                <div class="detail-row">
                    <div class="detail-label">Title:</div>
                    <div class="detail-value">${escapeHtml(product.title)}</div>
                </div>

                <div class="detail-row">
                    <div class="detail-label">Description:</div>
                    <div class="detail-value">${escapeHtml(product.description)}</div>
                </div>

                <div class="detail-row">
                    <div class="detail-label">Supplier:</div>
                    <div class="detail-value">
                        ${escapeHtml(product.supplier?.business_name || product.seller?.full_name || 'Unknown')}<br>
                        ${product.supplier?.verification_status === 'verified' ? 
                            '<span style="color: #10b981;"><i class="fas fa-check-circle"></i> Verified Supplier</span>' : ''}
                    </div>
                </div>

                <div class="detail-row">
                    <div class="detail-label">Category:</div>
                    <div class="detail-value">
                        ${escapeHtml(product.category?.name || 'Uncategorized')}
                        ${product.subcategory?.name ? ` → ${escapeHtml(product.subcategory.name)}` : ''}
                    </div>
                </div>

                <div class="detail-row">
                    <div class="detail-label">Pricing:</div>
                    <div class="detail-value">
                        <div>Regular Price: UGX ${parseInt(product.price || 0).toLocaleString()}</div>
                        ${product.wholesale_price ? `<div>Wholesale Price: UGX ${parseInt(product.wholesale_price).toLocaleString()}</div>` : ''}
                        ${product.is_negotiable ? '<div><span class="badge badge-info">Negotiable</span></div>' : ''}
                    </div>
                </div>

                ${product.bulk_pricing?.length > 0 ? `
                    <div class="detail-row">
                        <div class="detail-label">Bulk Pricing:</div>
                        <div class="detail-value">
                            <table class="bulk-pricing-table">
                                <thead>
                                    <tr>
                                        <th>Min Qty</th>
                                        <th>Max Qty</th>
                                        <th>Price/Unit</th>
                                        <th>Discount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${product.bulk_pricing.map(tier => `
                                        <tr>
                                            <td>${tier.min_quantity}</td>
                                            <td>${tier.max_quantity || '∞'}</td>
                                            <td>UGX ${parseInt(tier.price_per_unit).toLocaleString()}</td>
                                            <td>${tier.discount_percentage || 0}%</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ` : ''}

                <div class="detail-row">
                    <div class="detail-label">Stock:</div>
                    <div class="detail-value">
                        <div>Available: ${product.stock_quantity || 0} units</div>
                        <div>Low Stock Threshold: ${product.low_stock_threshold || 10}</div>
                        <div>MOQ: ${product.moq || 'Not specified'}</div>
                    </div>
                </div>

                <div class="detail-row">
                    <div class="detail-label">Lead Time:</div>
                    <div class="detail-value">${product.lead_time_days ? `${product.lead_time_days} days` : 'Not specified'}</div>
                </div>

                <div class="detail-row">
                    <div class="detail-label">Location:</div>
                    <div class="detail-value">${product.district}, ${product.region}</div>
                </div>

                <div class="detail-row">
                    <div class="detail-label">Status:</div>
                    <div class="detail-value">
                        <span class="badge ${getStatusBadgeClass(product.status)}">${product.status}</span>
                        ${product.is_featured ? '<span class="badge badge-purple">Featured</span>' : ''}
                        ${product.is_bulk_only ? '<span class="badge badge-purple">Bulk Only</span>' : ''}
                    </div>
                </div>

                <div class="detail-row">
                    <div class="detail-label">Dates:</div>
                    <div class="detail-value">
                        <div>Created: ${formatDate(product.created_at)}</div>
                        <div>Expires: ${formatDate(product.expires_at)}</div>
                        ${product.featured_until ? `<div>Featured Until: ${formatDate(product.featured_until)}</div>` : ''}
                    </div>
                </div>

                <div class="detail-row">
                    <div class="detail-label">Views:</div>
                    <div class="detail-value">${product.view_count || 0} views</div>
                </div>
            `;

            document.getElementById('productModal').classList.add('show');

            await sb.from('admin_actions').insert({
                admin_id: currentUser.id,
                action_type: 'ad_featured',
                target_ad_id: productId,
                details: { action: 'viewed_product' }
            });

        } catch (error) {
            console.error('Error viewing product:', error);
            showToast('Error loading product details', 'error');
        }
    }

    function editProduct(productId) {
        const product = products.find(p => p.id === productId);
        if (!product) return;

        currentProductId = productId;

        document.getElementById('editProductId').value = product.id;
        document.getElementById('editTitle').value = product.title || '';
        document.getElementById('editDescription').value = product.description || '';
        document.getElementById('editPrice').value = product.price || '';
        document.getElementById('editWholesalePrice').value = product.wholesale_price || '';
        document.getElementById('editStockQuantity').value = product.stock_quantity || '';
        document.getElementById('editLowStockThreshold').value = product.low_stock_threshold || 10;
        document.getElementById('editMoq').value = product.moq || '';
        document.getElementById('editLeadTime').value = product.lead_time_days || '';
        document.getElementById('editIsBulkOnly').checked = product.is_bulk_only || false;
        document.getElementById('editIsNegotiable').checked = product.is_negotiable || false;
        document.getElementById('editIsFeatured').checked = product.is_featured || false;
        document.getElementById('editStatus').value = product.status || 'active';

        closeModal('productModal');
        document.getElementById('editProductModal').classList.add('show');
    }

    async function saveProduct() {
        try {
            const productId = document.getElementById('editProductId').value;
            
            const updates = {
                title: document.getElementById('editTitle').value,
                description: document.getElementById('editDescription').value,
                price: document.getElementById('editPrice').value ? parseFloat(document.getElementById('editPrice').value) : null,
                wholesale_price: document.getElementById('editWholesalePrice').value ? parseFloat(document.getElementById('editWholesalePrice').value) : null,
                stock_quantity: document.getElementById('editStockQuantity').value ? parseInt(document.getElementById('editStockQuantity').value) : null,
                low_stock_threshold: parseInt(document.getElementById('editLowStockThreshold').value) || 10,
                moq: document.getElementById('editMoq').value ? parseInt(document.getElementById('editMoq').value) : null,
                lead_time_days: document.getElementById('editLeadTime').value ? parseInt(document.getElementById('editLeadTime').value) : null,
                is_bulk_only: document.getElementById('editIsBulkOnly').checked,
                is_negotiable: document.getElementById('editIsNegotiable').checked,
                is_featured: document.getElementById('editIsFeatured').checked,
                status: document.getElementById('editStatus').value,
                updated_at: new Date().toISOString()
            };

            if (updates.is_featured && !products.find(p => p.id === parseInt(productId))?.is_featured) {
                updates.featured_until = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
            } else if (!updates.is_featured) {
                updates.featured_until = null;
            }

            const { error } = await sb
                .from('ads')
                .update(updates)
                .eq('id', productId);

            if (error) throw error;

            await sb.from('admin_actions').insert({
                admin_id: currentUser.id,
                action_type: 'ad_featured',
                target_ad_id: productId,
                details: { updates }
            });

            showToast('Product updated successfully', 'success');
            closeModal('editProductModal');
            
            await loadProducts(currentPage);

        } catch (error) {
            console.error('Error saving product:', error);
            showToast('Error saving product', 'error');
        }
    }

    async function toggleProductStatus(productId, isActive) {
        try {
            const newStatus = isActive ? 'active' : 'draft';
            
            const { error } = await sb
                .from('ads')
                .update({ 
                    status: newStatus,
                    updated_at: new Date().toISOString()
                })
                .eq('id', productId);

            if (error) throw error;

            await sb.from('admin_actions').insert({
                admin_id: currentUser.id,
                action_type: isActive ? 'ad_featured' : 'ad_banned',
                target_ad_id: productId,
                details: { status: newStatus }
            });

            showToast(`Product ${isActive ? 'activated' : 'deactivated'}`, 'success');
            
            await loadProducts(currentPage);

        } catch (error) {
            console.error('Error toggling product status:', error);
            showToast('Error updating product status', 'error');
            await loadProducts(currentPage);
        }
    }

    async function deleteProduct(productId) {
        if (!confirm('Are you sure you want to delete this product? This action cannot be undone.')) {
            return;
        }

        try {
            const { error } = await sb
                .from('ads')
                .delete()
                .eq('id', productId);

            if (error) throw error;

            await sb.from('admin_actions').insert({
                admin_id: currentUser.id,
                action_type: 'ad_deleted',
                target_ad_id: productId
            });

            showToast('Product deleted successfully', 'success');
            
            await loadProducts(currentPage);
            await loadStats();

        } catch (error) {
            console.error('Error deleting product:', error);
            showToast('Error deleting product', 'error');
        }
    }

    async function exportProducts() {
        try {
            const { data, error } = await sb
                .from('ads')
                .select(`
                    *,
                    supplier:suppliers!ads_supplier_id_fkey (business_name),
                    category:categories!ads_category_id_fkey (name)
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;

            const headers = ['ID', 'Title', 'Supplier', 'Category', 'Price', 'Wholesale Price', 'Stock', 'Status', 'Created'];
            const csvData = data.map(p => [
                p.id,
                p.title,
                p.supplier?.business_name || '',
                p.category?.name || '',
                p.price || '',
                p.wholesale_price || '',
                p.stock_quantity || '',
                p.status || '',
                new Date(p.created_at).toLocaleDateString()
            ]);

            const csv = [headers.join(','), ...csvData.map(row => row.join(','))].join('\n');
            
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `products_export_${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
            window.URL.revokeObjectURL(url);

            showToast('Products exported successfully', 'success');

        } catch (error) {
            console.error('Error exporting products:', error);
            showToast('Error exporting products', 'error');
        }
    }

    function showAddProductModal() {
        window.location.href = 'post-ad.html?type=b2b&admin=true';
    }

    function closeModal(modalId) {
        document.getElementById(modalId).classList.remove('show');
    }

    // ========== INITIALIZATION ==========
    document.addEventListener('DOMContentLoaded', () => {
        checkAdmin();
    });

    // Public API
    return {
        currentProductId: currentProductId,
        viewProduct,
        editProduct,
        saveProduct,
        toggleProductStatus,
        deleteProduct,
        exportProducts,
        showAddProductModal,
        closeModal,
        applyFilters,
        resetFilters,
        changePage
    };
})();