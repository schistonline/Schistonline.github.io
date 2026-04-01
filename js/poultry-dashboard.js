<script>
    // Supabase Config
    const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // ===== STATE =====
    let currentSupplier = null;
    let batches = [];
    let bookings = [];
    let approvedBookings = [];
    let currentBookingId = null;
    let currentBookingPhone = null;

    // ===== INIT =====
    document.addEventListener('DOMContentLoaded', async () => {
        await checkAuth();
        await loadSupplierData();
        await loadBatches();
        await loadBookings();
        await loadStats();
        
        // Set default distribution date to 2 weeks from now
        const date = new Date();
        date.setDate(date.getDate() + 14);
        document.getElementById('batchDistributionDate').value = date.toISOString().split('T')[0];
    });

    async function checkAuth() {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            
            if (!user) {
                window.location.href = 'poultry-login.html';
                return;
            }
            
            const { data: supplier, error } = await supabase
                .from('poultry_suppliers')
                .select('*')
                .eq('profile_id', user.id)
                .single();
            
            if (error || !supplier) {
                window.location.href = 'poultry-register.html';
                return;
            }
            
            currentSupplier = supplier;
            updateUI();
        } catch (error) {
            console.error('Auth error:', error);
            showToast('Authentication error', 'error');
        }
    }

    function updateUI() {
        document.getElementById('companyName').textContent = currentSupplier.company_name || 'Poultry Farm';
        document.getElementById('companyLocation').textContent = currentSupplier.district || 'Kampala';
        document.getElementById('welcomeName').textContent = (currentSupplier.company_name || 'Farmer').split(' ')[0];
        document.getElementById('profileName').textContent = currentSupplier.company_name || 'Farmer';
        document.getElementById('profileAvatar').textContent = (currentSupplier.company_name || 'F').charAt(0);
        document.getElementById('menuAvatar').textContent = (currentSupplier.company_name || 'F').charAt(0);
        document.getElementById('menuName').textContent = currentSupplier.company_name || 'Poultry Farmer';
        
        // Fill manage form
        document.getElementById('editCompanyName').value = currentSupplier.company_name || '';
        document.getElementById('editTagline').value = currentSupplier.tagline || '';
        document.getElementById('editDescription').value = currentSupplier.description || '';
        document.getElementById('editPhone').value = currentSupplier.phone || '';
        document.getElementById('editWhatsApp').value = currentSupplier.whatsapp_number || '';
        document.getElementById('editDistrict').value = currentSupplier.district || 'Kampala';
        document.getElementById('editWebsite').value = currentSupplier.website || '';
        
        updatePreview();
    }

    function updatePreview() {
        document.getElementById('previewCompany').textContent = 
            document.getElementById('editCompanyName').value || 'Your Company';
        
        if (batches.length > 0) {
            document.getElementById('previewAvailable').textContent = 
                batches[0].available_quantity || 600;
            document.getElementById('previewBooked').textContent = 
                batches[0].booked_quantity || 200;
            document.getElementById('previewPrice').textContent = 
                `UGX ${(batches[0].price_per_bird || 2000).toLocaleString()} @`;
            document.getElementById('previewDate').textContent = 
                batches[0].distribution_date ? new Date(batches[0].distribution_date).toLocaleDateString() : '3/10/2026';
            document.getElementById('previewWeight').textContent = 
                `${batches[0].avg_weight_kg || 2} kg`;
        }
        
        // Set public page link
        if (batches.length > 0) {
            document.getElementById('publicPageLink').href = `poultry-index.html?batch=${batches[0].id}`;
            document.getElementById('previewBtn').href = `poultry-index.html?batch=${batches[0].id}`;
        }
    }

    async function loadSupplierData() {
        // This function can be expanded if needed
    }

    async function loadBatches() {
        try {
            const { data, error } = await supabase
                .from('poultry_batches')
                .select('*')
                .eq('supplier_id', currentSupplier.id)
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            
            batches = data || [];
            displayBatches();
        } catch (error) {
            console.error('Error loading batches:', error);
            showToast('Failed to load batches', 'error');
        }
    }

    function displayBatches() {
        const grid = document.getElementById('batchesGrid');
        
        if (batches.length === 0) {
            grid.innerHTML = `
                <div class="empty-state" style="grid-column: 1/-1; text-align: center; padding: 40px;">
                    <i class="fas fa-egg" style="font-size: 48px; color: var(--gray-300);"></i>
                    <h3 style="margin: 16px 0 8px;">No Batches Yet</h3>
                    <p style="color: var(--gray-500); margin-bottom: 20px;">Create your first batch to start selling</p>
                    <button class="btn btn-primary" onclick="showNewBatchSheet()">
                        <i class="fas fa-plus"></i> Create Batch
                    </button>
                </div>
            `;
            return;
        }
        
        grid.innerHTML = batches.map(batch => `
            <div class="batch-card">
                <div class="batch-image" style="background-image: url('${batch.images?.[0] || 'https://images.unsplash.com/photo-1548550023-2bdb3c5beed7?w=400'}')">
                    <span class="batch-status ${batch.status === 'available' ? '' : 'sold'}">
                        ${batch.status === 'available' ? 'Available' : batch.status}
                    </span>
                </div>
                <div class="batch-body">
                    <div class="batch-title">${batch.title || 'Poultry Batch'}</div>
                    <div class="batch-details">
                        <div class="detail-item">
                            <div class="detail-label">Age</div>
                            <div class="detail-value">${batch.age_weeks || 2} wks</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Weight</div>
                            <div class="detail-value">${batch.avg_weight_kg || 2} kg</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Price</div>
                            <div class="detail-value">UGX ${(batch.price_per_bird || 2000).toLocaleString()}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Pickup</div>
                            <div class="detail-value">${batch.distribution_date ? new Date(batch.distribution_date).toLocaleDateString() : 'TBD'}</div>
                        </div>
                    </div>
                    <div class="stock-info">
                        <div class="stock-item">
                            <div class="stock-label">Available</div>
                            <div class="stock-number available">${batch.available_quantity || 0}</div>
                        </div>
                        <div class="stock-item">
                            <div class="stock-label">Booked</div>
                            <div class="stock-number booked">${batch.booked_quantity || 0}</div>
                        </div>
                        <div class="stock-item">
                            <div class="stock-label">Sold</div>
                            <div class="stock-number">${batch.sold_quantity || 0}</div>
                        </div>
                    </div>
                    <div class="batch-footer">
                        <button class="btn btn-outline btn-sm" style="flex:1" onclick="editBatch('${batch.id}')">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                        <button class="btn btn-primary btn-sm" style="flex:1" onclick="viewBatch('${batch.id}')">
                            <i class="fas fa-eye"></i> View
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    }

    async function loadBookings() {
        try {
            const { data } = await supabase
                .from('poultry_bookings')
                .select(`
                    *,
                    batch:poultry_batches (*)
                `)
                .eq('supplier_id', currentSupplier.id)
                .eq('payment_status', 'pending')
                .order('created_at', { ascending: false });
            
            bookings = data || [];
            displayBookings();
            document.getElementById('statPendingBookings').textContent = bookings.length;
            document.getElementById('tabBookingsBadge').textContent = bookings.length;

            // Load approved
            const { data: approved } = await supabase
                .from('poultry_bookings')
                .select(`
                    *,
                    batch:poultry_batches (*)
                `)
                .eq('supplier_id', currentSupplier.id)
                .eq('payment_status', 'paid')
                .order('paid_at', { ascending: false });
            
            approvedBookings = approved || [];
            displayApproved();
        } catch (error) {
            console.error('Error loading bookings:', error);
        }
    }

    function displayBookings() {
        const tbody = document.getElementById('bookingsBody');
        
        if (bookings.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center" style="padding: 40px;">
                        <i class="fas fa-inbox" style="font-size: 40px; color: var(--gray-300);"></i>
                        <p>No pending bookings</p>
                    </td>
                </tr>
            `;
            return;
        }
        
        tbody.innerHTML = bookings.map(booking => `
            <tr>
                <td><strong>${booking.booking_number}</strong></td>
                <td>${booking.buyer_name}<br><small>${booking.buyer_phone}</small></td>
                <td>${booking.batch?.title || 'Batch'}</td>
                <td>${booking.quantity}</td>
                <td>UGX ${booking.total_amount?.toLocaleString()}</td>
                <td>${new Date(booking.created_at).toLocaleDateString()}</td>
                <td><span class="status-badge status-pending">Pending</span></td>
                <td>
                    <div class="action-btns">
                        <button class="action-btn" onclick="viewBooking('${booking.id}', '${booking.buyer_phone}')">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="action-btn" onclick="markAsPaid('${booking.id}')">
                            <i class="fas fa-check"></i>
                        </button>
                        <button class="action-btn" onclick="contactCustomer('${booking.buyer_phone}')">
                            <i class="fab fa-whatsapp"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    function displayApproved() {
        const tbody = document.getElementById('approvedBody');
        
        if (approvedBookings.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center" style="padding: 40px;">
                        <i class="fas fa-check-circle" style="font-size: 40px; color: var(--gray-300);"></i>
                        <p>No approved bookings</p>
                    </td>
                </tr>
            `;
            return;
        }
        
        tbody.innerHTML = approvedBookings.map(booking => `
            <tr>
                <td><strong>${booking.booking_number}</strong></td>
                <td>${booking.buyer_name}</td>
                <td>${booking.batch?.title || 'Batch'}</td>
                <td>${booking.quantity}</td>
                <td>UGX ${booking.total_amount?.toLocaleString()}</td>
                <td>${booking.paid_at ? new Date(booking.paid_at).toLocaleDateString() : 'N/A'}</td>
                <td>${booking.batch?.distribution_date ? new Date(booking.batch.distribution_date).toLocaleDateString() : 'TBD'}</td>
                <td>
                    <button class="action-btn" onclick="contactCustomer('${booking.buyer_phone}')">
                        <i class="fab fa-whatsapp"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    async function loadStats() {
        const activeBatches = batches.filter(b => b.status === 'available').length;
        document.getElementById('statActiveBatches').textContent = activeBatches;
        
        const totalBirds = batches.reduce((sum, b) => sum + (b.total_quantity || 0), 0);
        document.getElementById('statTotalBirds').textContent = totalBirds;
        
        const availableBirds = batches.reduce((sum, b) => sum + (b.available_quantity || 0), 0);
        document.getElementById('availableBirds').textContent = availableBirds;
        
        document.getElementById('statApproved').textContent = approvedBookings.length;
        
        const revenue = approvedBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0);
        document.getElementById('statRevenue').textContent = `UGX ${revenue.toLocaleString()}`;
    }

    // ===== BATCH OPERATIONS WITH BATCH NUMBER =====
    function showNewBatchSheet() {
        document.getElementById('newBatchSheet').classList.add('show');
    }

    function closeBatchSheet() {
        document.getElementById('newBatchSheet').classList.remove('show');
    }

    /**
     * Generate a unique batch number
     * Format: BATCH-YYYYMMDD-XXXX (e.g., BATCH-20260315-1234)
     */
    function generateBatchNumber() {
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const dateStr = `${year}${month}${day}`;
        
        // Generate random 4-digit number
        const random = Math.floor(1000 + Math.random() * 9000);
        
        return `BATCH-${dateStr}-${random}`;
    }

    async function createNewBatch() {
        // Get the submit button
        const submitBtn = document.querySelector('#newBatchSheet button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        
        // Show loading state
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
        submitBtn.disabled = true;
        
        try {
            // Get form values
            const title = document.getElementById('batchTitle').value.trim();
            const birdType = document.getElementById('batchType').value;
            const ageWeeks = parseInt(document.getElementById('batchAge').value) || 2;
            const totalQuantity = parseInt(document.getElementById('batchTotal').value) || 1000;
            const pricePerBird = parseFloat(document.getElementById('batchPrice').value) || 2000;
            const weight = parseFloat(document.getElementById('batchWeight').value) || 2.0;
            const distributionDate = document.getElementById('batchDistributionDate').value;
            const pickupLocation = document.getElementById('batchLocation').value.trim() || 'Farm pickup';
            
            // Validate required fields
            if (!title) {
                showToast('Please enter a batch title', 'error');
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
                return;
            }
            
            // Generate unique batch number
            const batchNumber = generateBatchNumber();
            
            console.log('Creating batch with number:', batchNumber);
            
            const newBatch = {
                supplier_id: currentSupplier.id,
                batch_number: batchNumber,  // CRITICAL: This was missing!
                title: title,
                bird_type: birdType,
                age_weeks: ageWeeks,
                total_quantity: totalQuantity,
                available_quantity: totalQuantity, // Initially all available
                booked_quantity: 0,
                sold_quantity: 0,
                price_per_bird: pricePerBird,
                avg_weight_kg: weight,
                distribution_date: distributionDate || null,
                pickup_location: pickupLocation,
                status: 'available',
                images: ['https://images.unsplash.com/photo-1548550023-2bdb3c5beed7?w=800'],
                vaccination_status: ['Newcastle', 'Gumboro'],
                health_certified: true,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            
            console.log('Inserting batch:', newBatch);
            
            const { data, error } = await supabase
                .from('poultry_batches')
                .insert([newBatch])
                .select(); // Add .select() to return the inserted data
            
            if (error) {
                console.error('Insert error:', error);
                
                // Check for specific constraint violations
                if (error.message.includes('batch_number')) {
                    showToast('Error: batch_number constraint - try a different name', 'error');
                } else if (error.code === '23505') {
                    showToast('Error: Duplicate batch number - please try again', 'error');
                } else if (error.code === '23502') {
                    showToast('Error: Missing required field - ' + error.message, 'error');
                } else {
                    showToast('Error: ' + error.message, 'error');
                }
            } else {
                console.log('Batch created successfully:', data);
                showToast('Batch created successfully!', 'success');
                closeBatchSheet();
                
                // Reset form
                document.getElementById('newBatchForm').reset();
                
                // Set default date again
                const date = new Date();
                date.setDate(date.getDate() + 14);
                document.getElementById('batchDistributionDate').value = date.toISOString().split('T')[0];
                
                // Reload data
                await loadBatches();
                await loadStats();
                updatePreview();
            }
        } catch (err) {
            console.error('Unexpected error:', err);
            showToast('An unexpected error occurred: ' + err.message, 'error');
        } finally {
            // Restore button
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    }

    function editBatch(batchId) {
        const batch = batches.find(b => b.id === batchId);
        if (!batch) return;
        
        document.getElementById('editBatchId').value = batch.id;
        document.getElementById('editAvailable').value = batch.available_quantity;
        document.getElementById('editPrice').value = batch.price_per_bird;
        document.getElementById('editDistributionDate').value = batch.distribution_date?.split('T')[0];
        document.getElementById('editStatus').value = batch.status;
        
        document.getElementById('editBatchModal').classList.add('show');
    }

    async function updateBatch() {
        const batchId = document.getElementById('editBatchId').value;
        
        const updates = {
            available_quantity: parseInt(document.getElementById('editAvailable').value),
            price_per_bird: parseFloat(document.getElementById('editPrice').value),
            distribution_date: document.getElementById('editDistributionDate').value,
            status: document.getElementById('editStatus').value,
            updated_at: new Date().toISOString()
        };
        
        const { error } = await supabase
            .from('poultry_batches')
            .update(updates)
            .eq('id', batchId);
        
        if (!error) {
            showToast('Batch updated!', 'success');
            closeModal('editBatchModal');
            await loadBatches();
            updatePreview();
        } else {
            showToast('Error updating: ' + error.message, 'error');
        }
    }

    function viewBatch(batchId) {
        window.open(`poultry-index.html?batch=${batchId}`, '_blank');
    }

    // ===== BOOKING OPERATIONS =====
    function viewBooking(bookingId, phone) {
        currentBookingId = bookingId;
        currentBookingPhone = phone;
        
        const booking = bookings.find(b => b.id === bookingId);
        if (!booking) return;
        
        document.getElementById('bookingDetails').innerHTML = `
            <div style="margin-bottom: 8px;"><strong>Booking #:</strong> ${booking.booking_number}</div>
            <div style="margin-bottom: 8px;"><strong>Customer:</strong> ${booking.buyer_name}</div>
            <div style="margin-bottom: 8px;"><strong>Phone:</strong> ${booking.buyer_phone}</div>
            <div style="margin-bottom: 8px;"><strong>Quantity:</strong> ${booking.quantity} birds</div>
            <div style="margin-bottom: 8px;"><strong>Amount:</strong> UGX ${booking.total_amount?.toLocaleString()}</div>
            <div style="margin-bottom: 8px;"><strong>Booked:</strong> ${new Date(booking.created_at).toLocaleString()}</div>
        `;
        
        document.getElementById('viewBookingModal').classList.add('show');
    }

    async function markAsPaid(bookingId) {
        const { error } = await supabase
            .from('poultry_bookings')
            .update({
                payment_status: 'paid',
                paid_at: new Date().toISOString()
            })
            .eq('id', bookingId);
        
        if (!error) {
            showToast('Payment confirmed!', 'success');
            closeModal('viewBookingModal');
            await loadBookings();
            await loadStats();
        } else {
            showToast('Error: ' + error.message, 'error');
        }
    }

    function contactCustomer(phone) {
        const cleanPhone = phone.replace(/\D/g, '');
        window.open(`https://wa.me/${cleanPhone}`, '_blank');
    }

    // ===== PAGE MANAGEMENT =====
    async function saveSupplierChanges() {
        const updates = {
            company_name: document.getElementById('editCompanyName').value,
            tagline: document.getElementById('editTagline').value,
            description: document.getElementById('editDescription').value,
            phone: document.getElementById('editPhone').value,
            whatsapp_number: document.getElementById('editWhatsApp').value,
            district: document.getElementById('editDistrict').value,
            website: document.getElementById('editWebsite').value,
            updated_at: new Date().toISOString()
        };
        
        const { error } = await supabase
            .from('poultry_suppliers')
            .update(updates)
            .eq('id', currentSupplier.id);
        
        if (!error) {
            showToast('Changes saved!', 'success');
            currentSupplier = { ...currentSupplier, ...updates };
            updateUI();
        } else {
            showToast('Error saving: ' + error.message, 'error');
        }
    }

    function resetForm() {
        updateUI();
    }

    // ===== TAB SWITCHING =====
    function switchTab(tab) {
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        event.target.classList.add('active');
        
        document.querySelectorAll('.tab-pane').forEach(pane => pane.style.display = 'none');
        document.getElementById(tab + 'Tab').style.display = 'block';
        
        // Update menu active state
        document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
        const tabs = ['manage', 'batches', 'bookings', 'approved'];
        const index = tabs.indexOf(tab);
        if (index >= 0) {
            document.querySelectorAll('.menu-item')[index].classList.add('active');
        }
    }

    // ===== MENU FUNCTIONS =====
    function toggleMenu() {
        document.getElementById('mobileMenu').classList.add('open');
        document.getElementById('menuOverlay').classList.add('show');
    }

    function closeMenu() {
        document.getElementById('mobileMenu').classList.remove('open');
        document.getElementById('menuOverlay').classList.remove('show');
    }

    function toggleProfileMenu() {
        // Mobile profile menu - can be expanded
        showToast('Profile menu', 'info');
    }

    function showNotifications() {
        showToast('No new notifications', 'info');
    }

    // ===== MODAL FUNCTIONS =====
    function closeModal(modalId) {
        document.getElementById(modalId).classList.remove('show');
    }

    // ===== UTILITIES =====
    function showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        toast.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i> ${message}`;
        toast.className = `toast ${type} show`;
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    function viewProfile() {
        showToast('Profile page coming soon', 'info');
        closeMenu();
    }

    function viewSettings() {
        showToast('Settings coming soon', 'info');
        closeMenu();
    }

    async function logout() {
        await supabase.auth.signOut();
        window.location.href = 'poultry-login.html';
    }

    function handleImageUpload() {
        showToast('Image upload coming soon', 'info');
    }

    // Make functions globally available
    window.switchTab = switchTab;
    window.toggleMenu = toggleMenu;
    window.closeMenu = closeMenu;
    window.showNewBatchSheet = showNewBatchSheet;
    window.closeBatchSheet = closeBatchSheet;
    window.createNewBatch = createNewBatch;
    window.editBatch = editBatch;
    window.viewBatch = viewBatch;
    window.viewBooking = viewBooking;
    window.markAsPaid = markAsPaid;
    window.contactCustomer = contactCustomer;
    window.saveSupplierChanges = saveSupplierChanges;
    window.resetForm = resetForm;
    window.closeModal = closeModal;
    window.viewProfile = viewProfile;
    window.viewSettings = viewSettings;
    window.logout = logout;
    window.showNotifications = showNotifications;
    window.handleImageUpload = handleImageUpload;
    window.toggleProfileMenu = toggleProfileMenu;
</script>