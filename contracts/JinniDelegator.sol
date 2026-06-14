// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
}

interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

contract JinniDelegator {
    // EIP-712 details
    bytes32 public constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    bytes32 public constant DELEGATION_TYPEHASH = keccak256(
        "Delegation(address delegator,address agent,uint256 maxSpendPerTrade,uint256 maxSpendPerWeek,uint256 expiry,uint256 nonce)"
    );

    bytes32 public DOMAIN_SEPARATOR;

    struct Delegation {
        address agent;
        uint256 maxSpendPerTrade;
        uint256 maxSpendPerWeek;
        uint256 spentThisWeek;
        uint256 lastResetTimestamp;
        uint256 expiry;
        bool active;
    }

    // delegator => agent => Delegation
    mapping(address => mapping(address => Delegation)) public delegations;
    // user => token => balance
    mapping(address => mapping(address => uint256)) public vaultBalances;
    // user => nonce for EIP-712 delegations
    mapping(address => uint256) public nonces;

    ISwapRouter public immutable swapRouter;
    address public constant UNISWAP_ROUTER = 0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E; // Sepolia Router02

    event Deposited(address indexed user, address indexed token, uint256 amount);
    event Withdrawn(address indexed user, address indexed token, uint256 amount);
    event DelegationGranted(address indexed delegator, address indexed agent, uint256 maxSpendPerTrade, uint256 maxSpendPerWeek, uint256 expiry);
    event DelegationRevoked(address indexed delegator, address indexed agent);
    event TradeExecuted(
        address indexed delegator,
        address indexed agent,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 timestamp
    );

    constructor() {
        swapRouter = ISwapRouter(UNISWAP_ROUTER);
        
        uint256 chainId;
        assembly {
            chainId := chainid()
        }
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256(bytes("JinniDelegator")),
                keccak256(bytes("1")),
                chainId,
                address(this)
            )
        );
    }

    // Vault logic
    function deposit(address token, uint256 amount) external payable {
        if (token == address(0)) {
            require(msg.value > 0, "No ETH sent");
            vaultBalances[msg.sender][address(0)] += msg.value;
            emit Deposited(msg.sender, address(0), msg.value);
        } else {
            require(amount > 0, "Amount must be > 0");
            require(IERC20(token).transferFrom(msg.sender, address(this), amount), "Transfer failed");
            vaultBalances[msg.sender][token] += amount;
            emit Deposited(msg.sender, token, amount);
        }
    }

    function withdraw(address token, uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        require(vaultBalances[msg.sender][token] >= amount, "Insufficient vault balance");
        vaultBalances[msg.sender][token] -= amount;

        if (token == address(0)) {
            (bool success, ) = msg.sender.call{value: amount}("");
            require(success, "ETH transfer failed");
            emit Withdrawn(msg.sender, address(0), amount);
        } else {
            require(IERC20(token).transfer(msg.sender, amount), "Token transfer failed");
            emit Withdrawn(msg.sender, token, amount);
        }
    }

    // Direct delegation grant
    function grantDelegationDirect(address agent, uint256 maxSpendPerTrade, uint256 maxSpendPerWeek, uint256 expiry) external {
        require(expiry > block.timestamp, "Expiry must be in the future");
        delegations[msg.sender][agent] = Delegation({
            agent: agent,
            maxSpendPerTrade: maxSpendPerTrade,
            maxSpendPerWeek: maxSpendPerWeek,
            spentThisWeek: 0,
            lastResetTimestamp: block.timestamp,
            expiry: expiry,
            active: true
        });

        emit DelegationGranted(msg.sender, agent, maxSpendPerTrade, maxSpendPerWeek, expiry);
    }

    // EIP-712 signature-based delegation grant (compatible with ERC-7715 client signatures)
    function grantDelegationWithSignature(
        address delegator,
        address agent,
        uint256 maxSpendPerTrade,
        uint256 maxSpendPerWeek,
        uint256 expiry,
        bytes calldata signature
    ) external {
        require(expiry > block.timestamp, "Expiry must be in the future");
        uint256 currentNonce = nonces[delegator];
        
        bytes32 structHash = keccak256(
            abi.encode(
                DELEGATION_TYPEHASH,
                delegator,
                agent,
                maxSpendPerTrade,
                maxSpendPerWeek,
                expiry,
                currentNonce
            )
        );
        bytes32 hash = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));

        address signer = recoverSigner(hash, signature);
        require(signer == delegator, "Invalid signature");

        nonces[delegator] = currentNonce + 1;

        delegations[delegator][agent] = Delegation({
            agent: agent,
            maxSpendPerTrade: maxSpendPerTrade,
            maxSpendPerWeek: maxSpendPerWeek,
            spentThisWeek: 0,
            lastResetTimestamp: block.timestamp,
            expiry: expiry,
            active: true
        });

        emit DelegationGranted(delegator, agent, maxSpendPerTrade, maxSpendPerWeek, expiry);
    }

    function revokeDelegation(address agent) external {
        require(delegations[msg.sender][agent].active, "No active delegation");
        delegations[msg.sender][agent].active = false;
        emit DelegationRevoked(msg.sender, agent);
    }

    function revokeDelegatorForAgent(address delegator) external {
        require(msg.sender == delegator || delegations[delegator][msg.sender].active, "Not authorized");
        delegations[delegator][msg.sender].active = false;
        emit DelegationRevoked(delegator, msg.sender);
    }

    // Executing trades via Uniswap V3
    function executeTrade(
        address delegator,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut
    ) external returns (uint256 amountOut) {
        Delegation storage del = delegations[delegator][msg.sender];
        require(del.active, "No active delegation for caller");
        require(block.timestamp <= del.expiry, "Delegation expired");

        // Reset weekly budget if 7 days have passed
        if (block.timestamp >= del.lastResetTimestamp + 7 days) {
            del.spentThisWeek = 0;
            del.lastResetTimestamp = block.timestamp;
        }

        // Limit checks
        require(amountIn <= del.maxSpendPerTrade, "Trade exceeds maxSpendPerTrade");
        require(del.spentThisWeek + amountIn <= del.maxSpendPerWeek, "Trade exceeds weekly budget");
        
        // Vault check
        require(vaultBalances[delegator][tokenIn] >= amountIn, "Insufficient user vault balance");

        // Deduct vault balance
        vaultBalances[delegator][tokenIn] -= amountIn;
        del.spentThisWeek += amountIn;

        // Perform Swap
        if (tokenIn == address(0)) {
            // ETH -> Token Out (WETH is needed for Uniswap router)
            // For simplicity in testing, we require ERC20 deposits.
            revert("ETH swaps not supported directly; deposit WETH/USDC");
        } else {
            // Approve Uniswap Router
            IERC20(tokenIn).approve(UNISWAP_ROUTER, amountIn);

            // Execute single swap
            ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: 3000, // 0.3%
                recipient: address(this),
                deadline: block.timestamp + 600,
                amountIn: amountIn,
                amountOutMinimum: minAmountOut,
                sqrtPriceLimitX96: 0
            });

            amountOut = swapRouter.exactInputSingle(params);
        }

        // Credit user's vault balance
        vaultBalances[delegator][tokenOut] += amountOut;

        emit TradeExecuted(delegator, msg.sender, tokenIn, tokenOut, amountIn, amountOut, block.timestamp);
    }

    function recoverSigner(bytes32 _ethSignedMessageHash, bytes memory _sig) internal pure returns (address) {
        (bytes32 r, bytes32 s, uint8 v) = splitSignature(_sig);
        return ecrecover(_ethSignedMessageHash, v, r, s);
    }

    function splitSignature(bytes memory sig) internal pure returns (bytes32 r, bytes32 s, uint8 v) {
        require(sig.length == 65, "invalid signature length");
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
    }

    // Helper view function to check remaining budget
    function getRemainingBudget(address delegator, address agent) external view returns (uint256) {
        Delegation memory del = delegations[delegator][agent];
        if (!del.active || block.timestamp > del.expiry) {
            return 0;
        }
        uint256 spent = del.spentThisWeek;
        if (block.timestamp >= del.lastResetTimestamp + 7 days) {
            spent = 0;
        }
        if (spent >= del.maxSpendPerWeek) {
            return 0;
        }
        return del.maxSpendPerWeek - spent;
    }
}
