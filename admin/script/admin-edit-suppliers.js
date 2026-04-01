// Admin Edit Suppliers JavaScript

// Supabase Configuration
const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Alpine.js Supplier Manager
document.addEventListener('alpine:init', () => {
    Alpine.data('supplierManager', () => ({
        // Data Properties
        suppliers: [],
        totalSuppliers: 0,
        missingPhoneCount: 0,
        loading: true,
        
        // Pagination
        currentPage: 1,
        perPage: 50,
        totalPages: 1,
        
        // Search & Filters
        searchQuery: '',
        filterMissing: 'all',
        activeFilters: [],
        
        // Selection
        selectedSuppliers: [],
        selectAll: false,
        
        // Modals
        showEditModal: false,
        showBulkEdit: false,
        editForm: {},
        
        // Bulk Edit
        bulkDistrict: '',
        bulkStatus: '',
        
        // ===== INITIALIZATION =====
        async init() {
            await this.checkAuth();
            await this.loadSuppliers();
            await this.loadStats();
        },
        
        async checkAuth() {
            try {
                const { data: { user }, error } = await supabase.auth.getUser();
                
                if (error || !user) {
                    alert('Please login as admin');
                    window.location.href = 'login.html?redirect=admin-edit-suppliers.html';
                    return;
                }
                
                // Check if user is admin
                const { data: profile, error: profileError } = await supabase
                    .from('profiles')
                    .select('is_admin')
                    .eq('id', user.id)
                    .single();
                
                if (profileError) throw profileError;
                
                if (!profile?.is_admin) {
                    alert('Access denied. Admin privileges required.');
                    window.location.href = 'index.html';
                }
                
            } catch (error) {
                console.error('Auth check error:', error);
                this.showToast('Authentication error', 'error');
            }
        },
        
        // ===== LOAD DATA =====
        async loadSuppliers() {
            this.loading = true;
            
            try {
                let query = supabase
                    .from('suppliers')
                    .select('*', { count: 'exact' })
                    .order('created_at', { ascending: false })
                    .range((this.currentPage - 1) * this.perPage, this.currentPage * this.perPage - 1);
                
                // Apply search
                if (this.searchQuery) {
                    query = query.or(`business_name.ilike.%${this.searchQuery}%,business_phone.ilike.%${this.searchQuery}%,business_email.ilike.%${this.searchQuery}%,warehouse_district.ilike.%${this.searchQuery}%`);
                    this.addFilter('Search: ' + this.searchQuery);
                }
                
                // Apply missing filters
                if (this.filterMissing === 'missing_phone') {
                    query = query.or('business_phone.is.null,business_phone.eq.+256700000000');
                    this.addFilter('Missing Phone');
                } else if (this.filterMissing === 'missing_email') {
                    query = query.is('business_email', null);
                    this.addFilter('Missing Email');
                } else if (this.filterMissing === 'missing_website') {
                    query = query.is('website', null);
                    this.addFilter('Missing Website');
                } else if (this.filterMissing === 'pending') {
                    query = query.eq('verification_status', 'pending');
                    this.addFilter('Pending Verification');
                }
                
                const { data, error, count } = await query;
                
                if (error) throw error;
                
                this.suppliers = data || [];
                this.totalSuppliers = count || 0;
                this.totalPages = Math.ceil((count || 0) / this.perPage);
                
            } catch (error) {
                console.error('Error loading suppliers:', error);
                this.showToast('Failed to load suppliers: ' + error.message, 'error');
            } finally {
                this.loading = false;
            }
        },
        
        async loadStats() {
            try {
                // Count missing phone numbers
                const { count, error } = await supabase
                    .from('suppliers')
                    .select('*', { count: 'exact', head: true })
                    .or('business_phone.is.null,business_phone.eq.+256700000000');
                
                if (error) throw error;
                
                this.missingPhoneCount = count || 0;
                
            } catch (error) {
                console.error('Error loading stats:', error);
                this.missingPhoneCount = 0;
            }
        },
        
        // ===== SUPPLIER OPERATIONS =====
        async saveSupplier() {
            try {
                const { error } = await supabase
                    .from('suppliers')
                    .update({
                        business_name: this.editForm.business_name,
                        business_phone: this.editForm.business_phone,
                        business_email: this.editForm.business_email,
                        website: this.editForm.website,
                        business_type: this.editForm.business_type,
                        warehouse_location: this.editForm.warehouse_location,
                        warehouse_district: this.editForm.warehouse_district,
                        contact_person: this.editForm.contact_person,
                        verification_status: this.editForm.verification_status,
                        admin_notes: this.editForm.admin_notes,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', this.editForm.id);
                
                if (error) throw error;
                
                this.showEditModal = false;
                await this.loadSuppliers();
                this.showToast('Supplier updated successfully!', 'success');
                
            } catch (error) {
                console.error('Error saving supplier:', error);
                this.showToast('Failed to save supplier: ' + error.message, 'error');
            }
        },
        
        editSupplier(supplier) {
            this.editForm = { ...supplier };
            this.showEditModal = true;
        },
        
        viewSupplier(supplier) {
            window.open(`/supplier/${supplier.id}`, '_blank');
        },
        
        // ===== BULK OPERATIONS =====
        async bulkUpdateDistrict() {
            if (!this.bulkDistrict || this.selectedSuppliers.length === 0) {
                this.showToast('Please select suppliers and a district', 'warning');
                return;
            }
            
            try {
                const { error } = await supabase
                    .from('suppliers')
                    .update({ warehouse_district: this.bulkDistrict })
                    .in('id', this.selectedSuppliers);
                
                if (error) throw error;
                
                this.showToast(`Updated ${this.selectedSuppliers.length} suppliers`, 'success');
                this.showBulkEdit = false;
                this.selectedSuppliers = [];
                this.selectAll = false;
                await this.loadSuppliers();
                
            } catch (error) {
                console.error('Error in bulk update:', error);
                this.showToast('Failed to update suppliers: ' + error.message, 'error');
            }
        },
        
        async bulkUpdateStatus() {
            if (!this.bulkStatus || this.selectedSuppliers.length === 0) {
                this.showToast('Please select suppliers and a status', 'warning');
                return;
            }
            
            try {
                const { error } = await supabase
                    .from('suppliers')
                    .update({ verification_status: this.bulkStatus })
                    .in('id', this.selectedSuppliers);
                
                if (error) throw error;
                
                this.showToast(`Updated ${this.selectedSuppliers.length} suppliers`, 'success');
                this.showBulkEdit = false;
                this.selectedSuppliers = [];
                this.selectAll = false;
                await this.loadSuppliers();
                
            } catch (error) {
                console.error('Error in bulk update:', error);
                this.showToast('Failed to update suppliers: ' + error.message, 'error');
            }
        },
        
        toggleAll() {
            if (this.selectAll) {
                this.selectedSuppliers = this.suppliers.map(s => s.id);
            } else {
                this.selectedSuppliers = [];
            }
        },
        
        // ===== EXPORT =====
        async exportCSV() {
            try {
                this.loading = true;
                
                const { data, error } = await supabase
                    .from('suppliers')
                    .select('*')
                    .order('created_at', { ascending: false });
                
                if (error) throw error;
                
                // Convert to CSV
                const headers = ['Business Name', 'Phone', 'Email', 'Website', 'Type', 'District', 'Location', 'Status', 'Contact Person', 'Created'];
                const csvRows = [];
                csvRows.push(headers.join(','));
                
                for (const supplier of data || []) {
                    const row = [
                        `"${supplier.business_name || ''}"`,
                        `"${supplier.business_phone || ''}"`,
                        `"${supplier.business_email || ''}"`,
                        `"${supplier.website || ''}"`,
                        `"${supplier.business_type || ''}"`,
                        `"${supplier.warehouse_district || ''}"`,
                        `"${supplier.warehouse_location || ''}"`,
                        supplier.verification_status || 'pending',
                        `"${supplier.contact_person || ''}"`,
                        new Date(supplier.created_at).toLocaleDateString()
                    ];
                    csvRows.push(row.join(','));
                }
                
                const csvString = csvRows.join('\n');
                const blob = new Blob([csvString], { type: 'text/csv' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.setAttribute('hidden', '');
                a.setAttribute('href', url);
                a.setAttribute('download', `suppliers_export_${new Date().toISOString().split('T')[0]}.csv`);
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                
                this.showToast(`Exported ${data?.length || 0} suppliers`, 'success');
                
            } catch (error) {
                console.error('Error exporting CSV:', error);
                this.showToast('Failed to export CSV: ' + error.message, 'error');
            } finally {
                this.loading = false;
            }
        },
        
        // ===== PAGINATION =====
        prevPage() {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.loadSuppliers();
            }
        },
        
        nextPage() {
            if (this.currentPage < this.totalPages) {
                this.currentPage++;
                this.loadSuppliers();
            }
        },
        
        goToPage(page) {
            this.currentPage = page;
            this.loadSuppliers();
        },
        
        get displayedPages() {
            const pages = [];
            const maxDisplayed = 5;
            let start = Math.max(1, this.currentPage - Math.floor(maxDisplayed / 2));
            let end = Math.min(this.totalPages, start + maxDisplayed - 1);
            
            if (end - start + 1 < maxDisplayed) {
                start = Math.max(1, end - maxDisplayed + 1);
            }
            
            for (let i = start; i <= end; i++) {
                pages.push(i);
            }
            return pages;
        },
        
        // ===== FILTERS =====
        addFilter(filter) {
            if (!this.activeFilters.includes(filter)) {
                this.activeFilters.push(filter);
            }
        },
        
        removeFilter(filter) {
            this.activeFilters = this.activeFilters.filter(f => f !== filter);
            
            if (filter.startsWith('Search:')) {
                this.searchQuery = '';
            } else if (filter === 'Missing Phone') {
                this.filterMissing = 'all';
            } else if (filter === 'Missing Email') {
                this.filterMissing = 'all';
            } else if (filter === 'Missing Website') {
                this.filterMissing = 'all';
            } else if (filter === 'Pending Verification') {
                this.filterMissing = 'all';
            }
            
            this.loadSuppliers();
        },
        
        clearFilters() {
            this.activeFilters = [];
            this.searchQuery = '';
            this.filterMissing = 'all';
            this.loadSuppliers();
        },
        
        // ===== UTILITIES =====
        showToast(message, type = 'info') {
            // Create toast element if it doesn't exist
            let toast = document.querySelector('.toast');
            if (!toast) {
                toast = document.createElement('div');
                toast.className = 'toast';
                document.body.appendChild(toast);
            }
            
            toast.textContent = message;
            toast.className = `toast ${type}`;
            
            setTimeout(() => {
                toast.remove();
            }, 3000);
        }
    }));
});