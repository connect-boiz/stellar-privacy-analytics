// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title PrivacyOracle
 * @dev Privacy-preserving oracle for external data verification
 * @notice Provides secure data feeds with privacy guarantees
 */
contract PrivacyOracle is Ownable, ReentrancyGuard, Pausable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // Structs
    struct DataRequest {
        bytes32 requestId;
        address requester;
        string dataSource;
        bytes32 dataHash;
        uint256 privacyLevel;
        uint256 timestamp;
        bool fulfilled;
        bool cancelled;
        uint256 fee;
    }

    struct DataResponse {
        bytes32 requestId;
        bytes32 resultHash;
        uint256 timestamp;
        bytes32[] privacyProofs;
        uint256 confidence;
    }

    struct OracleNode {
        address nodeAddress;
        string endpoint;
        bool active;
        uint256 reputation;
        uint256 totalRequests;
        uint256 successfulRequests;
        uint256 lastResponseTime;
    }

    // State variables
    mapping(bytes32 => DataRequest) public dataRequests;
    mapping(bytes32 => DataResponse) public dataResponses;
    mapping(address => OracleNode) public oracleNodes;
    mapping(string => uint256) public dataSourceFees;
    mapping(address => uint256) public userDeposits;

    // Arrays for iteration
    address[] public activeOracleNodes;
    bytes32[] public pendingRequests;

    // Counters
    uint256 public totalRequests;
    uint256 public totalFeesCollected;
    uint256 public averageResponseTime;

    // Constants
    uint256 public constant MIN_FEE = 0.01 ether;
    uint256 public constant MAX_FEE = 1 ether;
    uint256 public constant MIN_REPUTATION = 50;
    uint256 public constant RESPONSE_TIMEOUT = 1 hours;
    bytes32 public constant DOMAIN_SEPARATOR = keccak256("Stellar Privacy Oracle v1");

    // Events
    event DataRequested(
        bytes32 indexed requestId,
        address indexed requester,
        string dataSource,
        uint256 privacyLevel,
        uint256 fee
    );

    event DataFulfilled(
        bytes32 indexed requestId,
        address indexed oracle,
        bytes32 resultHash,
        uint256 confidence
    );

    event OracleNodeAdded(address indexed node, string endpoint);
    event OracleNodeRemoved(address indexed node);
    event OracleNodeUpdated(address indexed node, uint256 reputation);

    event FeeUpdated(string dataSource, uint256 oldFee, uint256 newFee);
    event DepositAdded(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);

    // Modifiers
    modifier onlyActiveOracle() {
        require(oracleNodes[msg.sender].active, "PrivacyOracle: Not an active oracle");
        _;
    }

    modifier validRequestId(bytes32 requestId) {
        require(dataRequests[requestId].requester != address(0), "PrivacyOracle: Invalid request ID");
        _;
    }

    modifier hasSufficientDeposit(uint256 amount) {
        require(userDeposits[msg.sender] >= amount, "PrivacyOracle: Insufficient deposit");
        _;
    }

    modifier validOracleNode(address node) {
        require(node != address(0), "PrivacyOracle: Invalid oracle address");
        _;
    }

    // Constructor
    constructor(address initialOwner) Ownable(initialOwner) {
        // Initialize default data source fees
        dataSourceFees["market_data"] = 0.05 ether;
        dataSourceFees["weather_data"] = 0.02 ether;
        dataSourceFees["social_metrics"] = 0.03 ether;
        dataSourceFees["financial_data"] = 0.1 ether;
    }

    /**
     * @dev Request data from external source with privacy protection
     * @param dataSource Name of the data source
     * @param dataHash Hash of the data requirements
     * @param privacyLevel Privacy level for the request (1-4)
     */
    function requestData(
        string memory dataSource,
        bytes32 dataHash,
        uint256 privacyLevel
    ) external nonReentrant whenNotPaused hasSufficientDeposit(dataSourceFees[dataSource]) returns (bytes32) {
        uint256 fee = dataSourceFees[dataSource];
        require(fee >= MIN_FEE && fee <= MAX_FEE, "PrivacyOracle: Invalid fee");
        require(privacyLevel >= 1 && privacyLevel <= 4, "PrivacyOracle: Invalid privacy level");

        // Generate request ID
        bytes32 requestId = keccak256(
            abi.encodePacked(
                msg.sender,
                dataSource,
                dataHash,
                privacyLevel,
                block.timestamp,
                block.difficulty
            )
        );

        // Create data request
        dataRequests[requestId] = DataRequest({
            requestId: requestId,
            requester: msg.sender,
            dataSource: dataSource,
            dataHash: dataHash,
            privacyLevel: privacyLevel,
            timestamp: block.timestamp,
            fulfilled: false,
            cancelled: false,
            fee: fee
        });

        // Deduct fee from deposit
        userDeposits[msg.sender] -= fee;
        totalFeesCollected += fee;
        totalRequests++;

        // Add to pending requests
        pendingRequests.push(requestId);

        emit DataRequested(requestId, msg.sender, dataSource, privacyLevel, fee);
        return requestId;
    }

    /**
     * @dev Fulfill a data request with privacy-protected results
     * @param requestId ID of the data request
     * @param resultHash Hash of the result data
     * @param privacyProofs Array of privacy proof hashes
     * @param confidence Confidence score of the result (0-100)
     */
    function fulfillRequest(
        bytes32 requestId,
        bytes32 resultHash,
        bytes32[] memory privacyProofs,
        uint256 confidence
    ) external onlyActiveOracle validRequestId(requestId) nonReentrant {
        DataRequest storage request = dataRequests[requestId];
        
        require(!request.fulfilled, "PrivacyOracle: Request already fulfilled");
        require(!request.cancelled, "PrivacyOracle: Request was cancelled");
        require(confidence <= 100, "PrivacyOracle: Invalid confidence score");

        // Store response
        dataResponses[requestId] = DataResponse({
            requestId: requestId,
            resultHash: resultHash,
            timestamp: block.timestamp,
            privacyProofs: privacyProofs,
            confidence: confidence
        });

        // Update request status
        request.fulfilled = true;

        // Update oracle statistics
        OracleNode storage oracle = oracleNodes[msg.sender];
        oracle.totalRequests++;
        oracle.successfulRequests++;
        oracle.lastResponseTime = block.timestamp;

        // Calculate response time and update average
        uint256 responseTime = block.timestamp - request.timestamp;
        averageResponseTime = (averageResponseTime + responseTime) / 2;

        // Update reputation based on performance
        _updateOracleReputation(msg.sender, confidence, responseTime);

        // Remove from pending requests
        _removeFromPending(requestId);

        emit DataFulfilled(requestId, msg.sender, resultHash, confidence);
    }

    /**
     * @dev Cancel a data request
     * @param requestId ID of the request to cancel
     */
    function cancelRequest(bytes32 requestId) external validRequestId(requestId) nonReentrant {
        DataRequest storage request = dataRequests[requestId];
        
        require(msg.sender == request.requester, "PrivacyOracle: Only requester can cancel");
        require(!request.fulfilled, "PrivacyOracle: Request already fulfilled");
        require(!request.cancelled, "PrivacyOracle: Request already cancelled");

        // Mark as cancelled
        request.cancelled = true;

        // Refund 50% of the fee
        uint256 refund = request.fee / 2;
        userDeposits[msg.sender] += refund;

        // Remove from pending requests
        _removeFromPending(requestId);
    }

    /**
     * @dev Add a new oracle node
     * @param node Address of the oracle node
     * @param endpoint API endpoint of the oracle
     */
    function addOracleNode(address node, string memory endpoint) external onlyOwner validOracleNode(node) {
        require(!oracleNodes[node].active, "PrivacyOracle: Oracle already exists");

        oracleNodes[node] = OracleNode({
            nodeAddress: node,
            endpoint: endpoint,
            active: true,
            reputation: 100, // Start with perfect reputation
            totalRequests: 0,
            successfulRequests: 0,
            lastResponseTime: 0
        });

        activeOracleNodes.push(node);

        emit OracleNodeAdded(node, endpoint);
    }

    /**
     * @dev Remove an oracle node
     * @param node Address of the oracle node to remove
     */
    function removeOracleNode(address node) external onlyOwner {
        require(oracleNodes[node].active, "PrivacyOracle: Oracle not active");

        oracleNodes[node].active = false;
        _removeFromActiveNodes(node);

        emit OracleNodeRemoved(node);
    }

    /**
     * @dev Update data source fee
     * @param dataSource Name of the data source
     * @param fee New fee amount
     */
    function updateFee(string memory dataSource, uint256 fee) external onlyOwner {
        require(fee >= MIN_FEE && fee <= MAX_FEE, "PrivacyOracle: Invalid fee");

        uint256 oldFee = dataSourceFees[dataSource];
        dataSourceFees[dataSource] = fee;

        emit FeeUpdated(dataSource, oldFee, fee);
    }

    /**
     * @dev Add deposit to user account
     */
    function addDeposit() external payable nonReentrant {
        require(msg.value > 0, "PrivacyOracle: Deposit must be greater than 0");
        
        userDeposits[msg.sender] += msg.value;
        
        emit DepositAdded(msg.sender, msg.value);
    }

    /**
     * @dev Withdraw deposit
     * @param amount Amount to withdraw
     */
    function withdraw(uint256 amount) external nonReentrant {
        require(userDeposits[msg.sender] >= amount, "PrivacyOracle: Insufficient balance");
        require(amount > 0, "PrivacyOracle: Amount must be greater than 0");

        userDeposits[msg.sender] -= amount;
        
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "PrivacyOracle: Withdrawal failed");

        emit Withdrawn(msg.sender, amount);
    }

    /**
     * @dev Get data request details
     * @param requestId ID of the data request
     */
    function getDataRequest(bytes32 requestId) external view returns (DataRequest memory) {
        return dataRequests[requestId];
    }

    /**
     * @dev Get data response details
     * @param requestId ID of the data request
     */
    function getDataResponse(bytes32 requestId) external view returns (DataResponse memory) {
        return dataResponses[requestId];
    }

    /**
     * @dev Get oracle node details
     * @param node Address of the oracle node
     */
    function getOracleNode(address node) external view returns (OracleNode memory) {
        return oracleNodes[node];
    }

    /**
     * @dev Get user's current deposit
     * @param user Address of the user
     */
    function getUserDeposit(address user) external view returns (uint256) {
        return userDeposits[user];
    }

    /**
     * @dev Get data source fee
     * @param dataSource Name of the data source
     */
    function getDataSourceFee(string memory dataSource) external view returns (uint256) {
        return dataSourceFees[dataSource];
    }

    /**
     * @dev Get pending requests count
     */
    function getPendingRequestsCount() external view returns (uint256) {
        return pendingRequests.length;
    }

    /**
     * @dev Get active oracle nodes count
     */
    function getActiveOracleNodesCount() external view returns (uint256) {
        return activeOracleNodes.length;
    }

    /**
     * @dev Get best oracle nodes based on reputation
     * @param count Number of top oracle nodes to return
     */
    function getBestOracleNodes(uint256 count) external view returns (address[] memory) {
        require(count <= activeOracleNodes.length, "PrivacyOracle: Count exceeds active nodes");

        address[] memory result = new address[](count);
        uint256[] memory reputations = new uint256[](activeOracleNodes.length);

        // Collect reputations
        for (uint256 i = 0; i < activeOracleNodes.length; i++) {
            reputations[i] = oracleNodes[activeOracleNodes[i]].reputation;
        }

        // Simple selection (in production, use proper sorting)
        for (uint256 i = 0; i < count; i++) {
            uint256 maxIndex = i;
            for (uint256 j = i + 1; j < activeOracleNodes.length; j++) {
                if (reputations[j] > reputations[maxIndex]) {
                    maxIndex = j;
                }
            }
            result[i] = activeOracleNodes[maxIndex];
            reputations[maxIndex] = 0; // Mark as used
        }

        return result;
    }

    /**
     * @dev Update oracle reputation based on performance
     */
    function _updateOracleReputation(address oracle, uint256 confidence, uint256 responseTime) internal {
        OracleNode storage node = oracleNodes[oracle];
        
        // Calculate reputation change
        int256 reputationChange = 0;
        
        // Factor in confidence (higher confidence = positive change)
        reputationChange += int256(confidence) / 10;
        
        // Factor in response time (faster = positive change)
        if (responseTime < 300) { // Less than 5 minutes
            reputationChange += 5;
        } else if (responseTime < 900) { // Less than 15 minutes
            reputationChange += 2;
        } else if (responseTime > 3600) { // More than 1 hour
            reputationChange -= 3;
        }

        // Update reputation (keep within bounds)
        int256 newReputation = int256(node.reputation) + reputationChange;
        node.reputation = uint256(newReputation < 0 ? 0 : newReputation > 100 ? 100 : newReputation);

        emit OracleNodeUpdated(oracle, node.reputation);
    }

    /**
     * @dev Remove request from pending list
     */
    function _removeFromPending(bytes32 requestId) internal {
        for (uint256 i = 0; i < pendingRequests.length; i++) {
            if (pendingRequests[i] == requestId) {
                pendingRequests[i] = pendingRequests[pendingRequests.length - 1];
                pendingRequests.pop();
                break;
            }
        }
    }

    /**
     * @dev Remove oracle from active list
     */
    function _removeFromActiveNodes(address node) internal {
        for (uint256 i = 0; i < activeOracleNodes.length; i++) {
            if (activeOracleNodes[i] == node) {
                activeOracleNodes[i] = activeOracleNodes[activeOracleNodes.length - 1];
                activeOracleNodes.pop();
                break;
            }
        }
    }

    /**
     * @dev Pause contract operations
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @dev Unpause contract operations
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @dev Get contract statistics
     */
    function getStats() external view returns (
        uint256 _totalRequests,
        uint256 _totalFeesCollected,
        uint256 _averageResponseTime,
        uint256 _pendingRequests,
        uint256 _activeOracleNodes
    ) {
        return (
            totalRequests,
            totalFeesCollected,
            averageResponseTime,
            pendingRequests.length,
            activeOracleNodes.length
        );
    }
}
