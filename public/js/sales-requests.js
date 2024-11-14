document.addEventListener('DOMContentLoaded', function() {
    const itemsPerPage = 7;
    const partnersPerPage = 5;
    let currentPage = 1;
    let currentPartnerPage = 1;
    let filteredRequests = [];
    let allRequests = [];
    let partnersData = [];

    // Load the page for the first time
    async function initializeTables() {
        const requestsTable = document.getElementById('requestsTable');
        if (requestsTable) {
            await getRequestsJson();
            updateRequestsTable();
            await getPartnersJson();
            updatePartnersTable();
        }
    }

    // Fetch the json requests data from the server
    async function getRequestsJson() {
        try {
            const response = await fetch('/sales/api/requests');
            if (!response.ok) throw new Error('Failed to fetch requests');
            const data = await response.json();
            allRequests = data.map(row => ({
                requestID: row.requestID,
                partner: row.partner,
                status: row.status,
                date: row.date
            }));
            filteredRequests = [...allRequests];
        } catch (error) {
            console.error('Error refreshing requests data:', error);
        }
    }

    // Fetch and display request details as json
    async function getRequestSidebarJson(requestID) {
        try {
            const response = await fetch(`/sales/api/${requestID}/details`);
            if (!response.ok) throw new Error('Failed to fetch request details');
            const details = await response.json();
            updateRequestDetailsPanel(details);
        } catch (error) {
            console.error('Error loading request details:', error);
            updateRequestDetailsPanel(null);
        }
    }

    // Fetch and display the partner details as json
    async function getPartnersJson() {
        try {
            const response = await fetch(`/sales/api/partners`);
            if (!response.ok) throw new Error('Failed to fetch partner details');
            const details = await response.json();
            allPartners = details.map(row => ({
                name: row.name,
                customerName: row.customerName,
                totalReqs: row.totalReqs,
                cancelRate: row.cancelRate
            }));
            partnersData = [...allPartners];
        } catch (error) {
            console.error('Error loading partner details:', error);
            updatePartnersTable(null);
        }
    }

    // Filter requests
    window.filterRequests = function() {
        const statusFilter = document.getElementById('statusFilter').value;
        
        filteredRequests = allRequests.filter(request => {
            return statusFilter === 'all' || request.status === statusFilter;
        });
        
        currentPage = 1;
        updateRequestsTable();
    };

    // Sort requests
    window.sortRequests = function() {
        const sortBy = document.getElementById('sortByRequest').value;
        
        // filteredRequests = [...filteredRequests];
        
        switch(sortBy) {
            case 'idAsc':
                filteredRequests.sort((a, b) => parseInt(a.requestID) - parseInt(b.requestID));
                break;
            case 'idDesc':
                filteredRequests.sort((a, b) => parseInt(b.requestID) - parseInt(a.requestID));
                break;
            case 'dateAsc':
                filteredRequests.sort((a, b) => new Date(a.date) - new Date(b.date));
                break;
            case 'dateDesc':
                filteredRequests.sort((a, b) => new Date(b.date) - new Date(a.date));
                break;
        }
        
        currentPage = 1;
        updateRequestsTable();
    };

    // Sort partners
    window.sortPartners = function() {
        const sortBy = document.getElementById('sortByPartner').value;
        
        switch(sortBy) {
            case 'totalAsc':
                partnersData.sort((a, b) => parseInt(a.totalReqs) - parseInt(b.totalReqs));
                break;
            case 'totalDesc':
                partnersData.sort((a, b) => parseInt(b.totalReqs) - parseInt(a.totalReqs));
                break;
            case 'cancelAsc':
                partnersData.sort((a, b) => parseFloat(a.cancelRate) - parseFloat(b.cancelRate));
                break;
            case 'cancelDesc':
                partnersData.sort((a, b) => parseFloat(b.cancelRate) - parseFloat(a.cancelRate));
                break;
        }

        currentPartnerPage = 1;
        updatePartnersTable();
    };

    // Update functions and pagination handlers (existing implementation)
    window.changePage = function(delta) {
        const totalPages = Math.ceil(filteredRequests.length / itemsPerPage);
        const newPage = currentPage + delta;
        
        if (newPage >= 1 && newPage <= totalPages) {
            currentPage = newPage;
            updateRequestsTable();
        }
    };

    // Function to change page on the sustainapartner table
    window.changePartnerPage = function(delta) {
        const totalPages = Math.ceil(partnersData.length / partnersPerPage);
        const newPage = currentPartnerPage + delta;
        
        if (newPage >= 1 && newPage <= totalPages) {
            currentPartnerPage = newPage;
            updatePartnersTable();
        }
    };

    // Using the current contents of filteredRequests, clear and update the requests table
    function updateRequestsTable() {
        const tbody = document.getElementById('requestsTable').querySelector('tbody');
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, filteredRequests.length);
        const pageData = filteredRequests.slice(startIndex, endIndex);

        // Clear existing rows
        tbody.innerHTML = '';

        // Add new rows
        pageData.forEach(request => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><input type="checkbox" class="request-checkbox"></td>
                <td>${request.requestID}</td>
                <td>${request.partner}</td>
                <td>${request.status}</td>
                <td>${request.date}</td>
            `;

            // Add click event listener to the checkbox
            const checkbox = row.querySelector('.request-checkbox');
            checkbox.addEventListener('change', function() {
                // Uncheck all other checkboxes
                document.querySelectorAll('.request-checkbox').forEach(cb => {
                    if (cb !== checkbox) cb.checked = false;
                });

                if (checkbox.checked) {
                    // Load details for the selected request
                    selectedRequest = request.requestID;
                    getRequestSidebarJson(request.requestID);
                } else {
                    // Clear the details panel
                    selectedRequest = null;
                    updateRequestDetailsPanel(null);
                }
            });
            
            tbody.appendChild(row);
        });

        // Update pagination controls
        const totalPages = Math.ceil(filteredRequests.length / itemsPerPage);
        document.getElementById('currentPage').textContent = currentPage;
        document.getElementById('totalPages').textContent = totalPages;
        document.getElementById('prevRequest').disabled = currentPage === 1;
        document.getElementById('nextRequest').disabled = currentPage === totalPages || filteredRequests.length === 0;

        // Handle empty state
        if (filteredRequests.length === 0) {
            const emptyRow = document.createElement('tr');
            emptyRow.innerHTML = '<td colspan="5" class="text-center">No requests found</td>';
            tbody.appendChild(emptyRow);
        }
    }
    
    // Update the details panel with request information
    function updateRequestDetailsPanel(details) {
        const detailsContainer = document.querySelector('.request-details .item-list');
        const totalElement = document.getElementById('request-total');
        const statusElement = document.getElementById('request-status');

        if (!details) {
            // Show error or empty state
            detailsContainer.innerHTML = '<p class="empty-state">No request details available</p>';
            totalElement.textContent = '₱0';
            statusElement.textContent = 'N/A';
            return;
        }

        // Update items list
        detailsContainer.innerHTML = details.items.map(item => `
            <div class="item">
                <div class="placeholder-image"><img class="request-image" src="${item.itemImage}" alt="Product Image" ></div>
                <p>${item.name}</p>
                <p>${item.quantity} kg</p>
                <p>₱${item.price.toFixed(2)}</p>
            </div>
        `).join('');

        // Update summary section
        totalElement.textContent = `₱${details.total.toFixed(2)}`;
        statusElement.textContent = details.status;

        // Show the details panel if it was hidden
        document.querySelector('.request-details').style.display = 'block';
    }

    // Update the partners table with given information
    async function updatePartnersTable() {
        const tbody = document.getElementById('partnersTable').querySelector('tbody');
        const startIndex = (currentPartnerPage - 1) * partnersPerPage;
        const endIndex = Math.min(startIndex + partnersPerPage, partnersData.length);
        const pageData = partnersData.slice(startIndex, endIndex);

        tbody.innerHTML = '';

        pageData.forEach(partner => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${partner.name}</td>
                <td>${partner.customerName}</td>
                <td>${partner.totalReqs}</td>
                <td>${partner.cancelRate}</td>
                <td><button class="contact-button">Contact</button></td>
            `;

            const contactButton = row.querySelector('.contact-button');
            contactButton.addEventListener('click', function() {
                console.log("Contact button clicked.");
                // TODO: Link to corresponding chat
            });
            
            tbody.appendChild(row);
        });

        const totalPartnerPages = Math.ceil(partnersData.length / partnersPerPage);
        document.getElementById('currentPartnerPage').textContent = currentPartnerPage;
        document.getElementById('totalPartnerPages').textContent = totalPartnerPages;
        document.getElementById('prevPartner').disabled = currentPartnerPage === 1;
        document.getElementById('nextPartner').disabled = currentPartnerPage === totalPartnerPages || partnersData.length === 0;

        if (partnersData.length === 0) {
            const emptyRow = document.createElement('tr');
            emptyRow.innerHTML = '<td colspan="5" class="text-center">No partners found</td>';
            tbody.appendChild(emptyRow);
        }
    }

    // For every selected request, set its status to 'Cancelled'
    window.cancelRequests = async function() {
        const requestsTable = document.getElementById('requestsTable');
        if (requestsTable) {
            const checkedBoxes = requestsTable.querySelectorAll('.request-checkbox:checked');
            const confirmMessage = checkedBoxes.length === 1 
                ? 'Are you sure you want to cancel this request?' 
                : `Are you sure you want to cancel these ${checkedBoxes.length} requests?`;
            if (!confirm(confirmMessage)) return;

            // Get all selected requests
            const cancelPromises = Array.from(checkedBoxes).map(async checkbox => {
                const row = checkbox.closest('tr');
                const requestID = row.cells[1].textContent.trim();
                return setRequestStatus(requestID, "Cancelled");
            });

            try {
                await Promise.all(cancelPromises);
                await getRequestsJson();
                updateRequestsTable();
                await getPartnersJson();
                updatePartnersTable();
                
                // Clear all checkboxes
                checkedBoxes.forEach(checkbox => {
                    checkbox.checked = false;
                });
            } catch (error) {
                console.error('Error cancelling requests:', error);
                alert('Failed to cancel one or more requests. Please try again.');
            }
        }
    };

    // Modify the MongoDB to set the request status
    async function setRequestStatus(requestID, status) {
        try {
            const response = await fetch(`/sales/api/${requestID}/status`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status })
            });
            if (!response.ok) throw new Error(`Failed to update status for request ${requestID}`);
        } catch (error) {
            console.error('Failed to update request status:', error);
            throw error;
        }
    }

    initializeTables();
});