// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title StellarAnalytics
 * @dev Privacy-preserving analytics smart contract for Stellar ecosystem
 * @notice Enables secure data analysis with privacy guarantees
 */
contract StellarAnalytics is Ownable, ReentrancyGuard, Pausable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // Structs
    struct AnalysisRequest {
        bytes32 requestId;
        address requester;
        bytes32 datasetHash;
        uint256 privacyBudget;
        uint256 timestamp;
        bool completed;
        bool cancelled;
        string analysisType;
    }

    struct AnalysisResult {
        bytes32 requestId;
        bytes32 resultHash;
        uint256 privacyBudgetUsed;
        uint256 accuracy;
        uint256 timestamp;
        bytes32[] privacyProofs;
    }

    struct PrivacyLevel {
        uint256 minParticipants;
        uint256 noiseMultiplier;
        bool requireConsent;
        uint256 maxDataPoints;
    }

    // State variables
    mapping(bytes32 => AnalysisRequest) public analysisRequests;
    mapping(bytes32 => AnalysisResult) public analysisResults;
    mapping(address => uint256) public userPrivacyBudget;
    mapping(string => PrivacyLevel) public privacyLevels;
    mapping(address => bool) public authorizedOracles;
    mapping(address => bool) public authorizedAnalyzers;

    // Counters
    uint256 public totalAnalyses;
    uint256 public totalPrivacyBudgetUsed;
    uint256 public activeAnalyses;

    // Constants
    uint256 public constant MAX_PRIVACY_BUDGET = 1000 * 10**18; // 1000 tokens
    uint256 public constant DEFAULT_PRIVACY_BUDGET = 100 * 10**18; // 100 tokens
    uint256 public constant MIN_PARTICIPANTS = 5;
    bytes32 public constant DOMAIN_SEPARATOR = keccak256("Stellar Analytics v1");

    // Events
    event AnalysisRequested(
        bytes32 indexed requestId,
        address indexed requester,
        bytes32 datasetHash,
        string analysisType,
        uint256 privacyBudget
    );

    event AnalysisCompleted(
        bytes32 indexed requestId,
        bytes32 resultHash,
        uint256 privacyBudgetUsed,
        uint256 accuracy
    );

    event AnalysisCancelled(bytes32 indexed requestId, address indexed requester);

    event PrivacyBudgetUpdated(address indexed user, uint256 oldBudget, uint256 newBudget);

    event OracleAdded(address indexed oracle);
    event OracleRemoved(address indexed oracle);

    event AnalyzerAdded(address indexed analyzer);
    event AnalyzerRemoved(address indexed analyzer);

    // Modifiers
    modifier onlyAuthorizedOracle() {
        require(authorizedOracles[msg.sender], "StellarAnalytics: Not authorized oracle");
        _;
    }

    modifier onlyAuthorizedAnalyzer() {
        require(authorizedAnalyzers[msg.sender], "StellarAnalytics: Not authorized analyzer");
        _;
    }

    modifier hasSufficientPrivacyBudget(uint256 budget) {
        require(userPrivacyBudget[msg.sender] >= budget, "StellarAnalytics: Insufficient privacy budget");
        _;
    }

    modifier validRequestId(bytes32 requestId) {
        require(analysisRequests[requestId].requester != address(0), "StellarAnalytics: Invalid request ID");
        _;
    }

    // Constructor
    constructor(address initialOwner) Ownable(initialOwner) {
        // Initialize privacy levels
        privacyLevels["minimal"] = PrivacyLevel({
            minParticipants: 5,
            noiseMultiplier: 1,
            requireConsent: false,
            maxDataPoints: 1000
        });

        privacyLevels["standard"] = PrivacyLevel({
            minParticipants: 10,
            noiseMultiplier: 2,
            requireConsent: true,
            maxDataPoints: 5000
        });

        privacyLevels["high"] = PrivacyLevel({
            minParticipants: 20,
            noiseMultiplier: 5,
            requireConsent: true,
            maxDataPoints: 10000
        });

        privacyLevels["maximum"] = PrivacyLevel({
            minParticipants: 50,
            noiseMultiplier: 10,
            requireConsent: true,
            maxDataPoints: 50000
        });
    }

    /**
     * @dev Request a new analysis
     * @param datasetHash Hash of the dataset to analyze
     * @param analysisType Type of analysis to perform
     * @param privacyLevel Privacy level for the analysis
     * @param signature Signature from data owner authorizing the analysis
     */
    function requestAnalysis(
        bytes32 datasetHash,
        string memory analysisType,
        string memory privacyLevel,
        bytes memory signature
    ) external nonReentrant whenNotPaused hasSufficientPrivacyBudget(DEFAULT_PRIVACY_BUDGET) returns (bytes32) {
        // Validate privacy level
        require(privacyLevels[privacyLevel].minParticipants > 0, "StellarAnalytics: Invalid privacy level");

        // Generate request ID
        bytes32 requestId = keccak256(
            abi.encodePacked(
                msg.sender,
                datasetHash,
                analysisType,
                block.timestamp,
                block.difficulty
            )
        );

        // Verify signature if consent is required
        if (privacyLevels[privacyLevel].requireConsent) {
            bytes32 messageHash = keccak256(
                abi.encodePacked(requestId, datasetHash, analysisType)
            ).toEthSignedMessageHash();
            address signer = messageHash.recover(signature);
            require(signer != address(0), "StellarAnalytics: Invalid signature");
        }

        // Create analysis request
        analysisRequests[requestId] = AnalysisRequest({
            requestId: requestId,
            requester: msg.sender,
            datasetHash: datasetHash,
            privacyBudget: DEFAULT_PRIVACY_BUDGET,
            timestamp: block.timestamp,
            completed: false,
            cancelled: false,
            analysisType: analysisType
        });

        // Update user privacy budget
        userPrivacyBudget[msg.sender] -= DEFAULT_PRIVACY_BUDGET;
        totalPrivacyBudgetUsed += DEFAULT_PRIVACY_BUDGET;
        totalAnalyses++;
        activeAnalyses++;

        emit AnalysisRequested(requestId, msg.sender, datasetHash, analysisType, DEFAULT_PRIVACY_BUDGET);
        return requestId;
    }

    /**
     * @dev Complete an analysis with results
     * @param requestId ID of the analysis request
     * @param resultHash Hash of the analysis results
     * @param privacyBudgetUsed Actual privacy budget consumed
     * @param accuracy Accuracy score of the analysis
     * @param privacyProofs Array of privacy proof hashes
     */
    function completeAnalysis(
        bytes32 requestId,
        bytes32 resultHash,
        uint256 privacyBudgetUsed,
        uint256 accuracy,
        bytes32[] memory privacyProofs
    ) external onlyAuthorizedAnalyzer validRequestId(requestId) nonReentrant {
        AnalysisRequest storage request = analysisRequests[requestId];
        
        require(!request.completed, "StellarAnalytics: Analysis already completed");
        require(!request.cancelled, "StellarAnalytics: Analysis was cancelled");
        require(privacyBudgetUsed <= request.privacyBudget, "StellarAnalytics: Budget exceeded");

        // Store results
        analysisResults[requestId] = AnalysisResult({
            requestId: requestId,
            resultHash: resultHash,
            privacyBudgetUsed: privacyBudgetUsed,
            accuracy: accuracy,
            timestamp: block.timestamp,
            privacyProofs: privacyProofs
        });

        // Update request status
        request.completed = true;
        activeAnalyses--;

        // Refund unused privacy budget
        uint256 refund = request.privacyBudget - privacyBudgetUsed;
        if (refund > 0) {
            userPrivacyBudget[request.requester] += refund;
        }

        emit AnalysisCompleted(requestId, resultHash, privacyBudgetUsed, accuracy);
    }

    /**
     * @dev Cancel an analysis request
     * @param requestId ID of the analysis request to cancel
     */
    function cancelAnalysis(bytes32 requestId) external validRequestId(requestId) nonReentrant {
        AnalysisRequest storage request = analysisRequests[requestId];
        
        require(msg.sender == request.requester, "StellarAnalytics: Only requester can cancel");
        require(!request.completed, "StellarAnalytics: Analysis already completed");
        require(!request.cancelled, "StellarAnalytics: Analysis already cancelled");

        // Mark as cancelled
        request.cancelled = true;
        activeAnalyses--;

        // Refund privacy budget
        userPrivacyBudget[msg.sender] += request.privacyBudget;

        emit AnalysisCancelled(requestId, msg.sender);
    }

    /**
     * @dev Add privacy budget to a user
     * @param user Address of the user
     * @param amount Amount of privacy budget to add
     */
    function addPrivacyBudget(address user, uint256 amount) external onlyOwner {
        require(user != address(0), "StellarAnalytics: Invalid user address");
        require(userPrivacyBudget[user] + amount <= MAX_PRIVACY_BUDGET, "StellarAnalytics: Budget exceeds maximum");

        uint256 oldBudget = userPrivacyBudget[user];
        userPrivacyBudget[user] += amount;

        emit PrivacyBudgetUpdated(user, oldBudget, userPrivacyBudget[user]);
    }

    /**
     * @dev Add authorized oracle
     * @param oracle Address of the oracle to add
     */
    function addOracle(address oracle) external onlyOwner {
        require(oracle != address(0), "StellarAnalytics: Invalid oracle address");
        require(!authorizedOracles[oracle], "StellarAnalytics: Oracle already authorized");

        authorizedOracles[oracle] = true;
        emit OracleAdded(oracle);
    }

    /**
     * @dev Remove authorized oracle
     * @param oracle Address of the oracle to remove
     */
    function removeOracle(address oracle) external onlyOwner {
        require(authorizedOracles[oracle], "StellarAnalytics: Oracle not authorized");

        authorizedOracles[oracle] = false;
        emit OracleRemoved(oracle);
    }

    /**
     * @dev Add authorized analyzer
     * @param analyzer Address of the analyzer to add
     */
    function addAnalyzer(address analyzer) external onlyOwner {
        require(analyzer != address(0), "StellarAnalytics: Invalid analyzer address");
        require(!authorizedAnalyzers[analyzer], "StellarAnalytics: Analyzer already authorized");

        authorizedAnalyzers[analyzer] = true;
        emit AnalyzerAdded(analyzer);
    }

    /**
     * @dev Remove authorized analyzer
     * @param analyzer Address of the analyzer to remove
     */
    function removeAnalyzer(address analyzer) external onlyOwner {
        require(authorizedAnalyzers[analyzer], "StellarAnalytics: Analyzer not authorized");

        authorizedAnalyzers[analyzer] = false;
        emit AnalyzerRemoved(analyzer);
    }

    /**
     * @dev Get analysis request details
     * @param requestId ID of the analysis request
     */
    function getAnalysisRequest(bytes32 requestId) external view returns (AnalysisRequest memory) {
        return analysisRequests[requestId];
    }

    /**
     * @dev Get analysis result details
     * @param requestId ID of the analysis request
     */
    function getAnalysisResult(bytes32 requestId) external view returns (AnalysisResult memory) {
        return analysisResults[requestId];
    }

    /**
     * @dev Get privacy level details
     * @param levelName Name of the privacy level
     */
    function getPrivacyLevel(string memory levelName) external view returns (PrivacyLevel memory) {
        return privacyLevels[levelName];
    }

    /**
     * @dev Check if user has sufficient privacy budget
     * @param user Address of the user
     * @param requiredBudget Required privacy budget
     */
    function hasPrivacyBudget(address user, uint256 requiredBudget) external view returns (bool) {
        return userPrivacyBudget[user] >= requiredBudget;
    }

    /**
     * @dev Get user's current privacy budget
     * @param user Address of the user
     */
    function getUserPrivacyBudget(address user) external view returns (uint256) {
        return userPrivacyBudget[user];
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
        uint256 _totalAnalyses,
        uint256 _totalPrivacyBudgetUsed,
        uint256 _activeAnalyses,
        uint256 _authorizedOracles,
        uint256 _authorizedAnalyzers
    ) {
        return (
            totalAnalyses,
            totalPrivacyBudgetUsed,
            activeAnalyses,
            authorizedOracles[msg.sender] ? 1 : 0, // Simplified count
            authorizedAnalyzers[msg.sender] ? 1 : 0  // Simplified count
        );
    }
}
