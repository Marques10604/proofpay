use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("5rULicy7hRi91KADEB1J4kgPtezJHgM96WM7pXCYNYFY");

#[program]
pub mod proofpay {
    use super::*;

    /// Create a new escrow agreement between payer and payee
    pub fn create_escrow(
        ctx: Context<CreateEscrow>,
        escrow_id: [u8; 32],
        total_amount: u64,
        milestones: Vec<Milestone>,
        timeout_seconds: i64,
    ) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        let clock = Clock::get()?;

        require!(milestones.len() > 0 && milestones.len() <= 10, EscrowError::InvalidMilestoneCount);
        require!(total_amount > 0, EscrowError::InvalidAmount);

        let total_bps: u16 = milestones.iter().map(|m| m.release_bps).sum();
        require!(total_bps == 10000, EscrowError::MilestoneBpsMismatch);

        escrow.escrow_id = escrow_id;
        escrow.payer = ctx.accounts.payer.key();
        escrow.payee = ctx.accounts.payee.key();
        escrow.total_amount = total_amount;
        escrow.released_amount = 0;
        escrow.milestones = milestones;
        escrow.current_milestone = 0;
        escrow.state = EscrowState::Created;
        escrow.created_at = clock.unix_timestamp;
        escrow.timeout_at = clock.unix_timestamp + timeout_seconds;
        escrow.bump = ctx.bumps.escrow;

        emit!(EscrowCreated {
            escrow_id,
            payer: escrow.payer,
            payee: escrow.payee,
            total_amount,
        });

        Ok(())
    }

    /// Fund the escrow — payer transfers tokens to vault
    pub fn fund_escrow(ctx: Context<FundEscrow>, amount: u64) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;

        require!(escrow.state == EscrowState::Created, EscrowError::InvalidState);
        require!(amount == escrow.total_amount, EscrowError::InvalidAmount);

        // Transfer tokens from payer to vault
        let cpi_accounts = Transfer {
            from: ctx.accounts.payer_token_account.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.payer.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        token::transfer(CpiContext::new(cpi_program, cpi_accounts), amount)?;

        escrow.state = EscrowState::Funded;

        emit!(EscrowFunded {
            escrow_id: escrow.escrow_id,
            amount,
        });

        Ok(())
    }

    /// Release funds for a specific milestone
    pub fn release_milestone(ctx: Context<ReleaseMilestone>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;

        require!(escrow.state == EscrowState::Funded, EscrowError::InvalidState);
        require!(
            ctx.accounts.payer.key() == escrow.payer,
            EscrowError::Unauthorized
        );

        let milestone_idx = escrow.current_milestone as usize;
        require!(milestone_idx < escrow.milestones.len(), EscrowError::AllMilestonesReleased);

        let milestone = &escrow.milestones[milestone_idx];
        let release_amount = (escrow.total_amount as u128 * milestone.release_bps as u128 / 10000) as u64;

        // Transfer from vault to payee
        let escrow_id = escrow.escrow_id;
        let bump = escrow.bump;
        let seeds = &[b"escrow", escrow_id.as_ref(), &[bump]];
        let signer = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.payee_token_account.to_account_info(),
            authority: escrow.to_account_info(),
        };
        token::transfer(
            CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), cpi_accounts, signer),
            release_amount,
        )?;

        escrow.released_amount += release_amount;
        escrow.current_milestone += 1;

        if escrow.current_milestone as usize == escrow.milestones.len() {
            escrow.state = EscrowState::Completed;
        }

        emit!(MilestoneReleased {
            escrow_id: escrow.escrow_id,
            milestone_index: milestone_idx as u8,
            amount: release_amount,
        });

        Ok(())
    }

    /// Refund payer if timeout has passed and escrow not completed
    pub fn refund_on_timeout(ctx: Context<RefundOnTimeout>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        let clock = Clock::get()?;

        require!(escrow.state == EscrowState::Funded, EscrowError::InvalidState);
        require!(clock.unix_timestamp >= escrow.timeout_at, EscrowError::TimeoutNotReached);

        let remaining = escrow.total_amount - escrow.released_amount;
        let escrow_id = escrow.escrow_id;
        let bump = escrow.bump;
        let seeds = &[b"escrow", escrow_id.as_ref(), &[bump]];
        let signer = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.payer_token_account.to_account_info(),
            authority: escrow.to_account_info(),
        };
        token::transfer(
            CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), cpi_accounts, signer),
            remaining,
        )?;

        escrow.state = EscrowState::Refunded;

        emit!(EscrowRefunded {
            escrow_id: escrow.escrow_id,
            amount: remaining,
        });

        Ok(())
    }
}

// ─────────────────────────────────────────────
// Accounts
// ─────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(escrow_id: [u8; 32])]
pub struct CreateEscrow<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + EscrowAccount::MAX_SIZE,
        seeds = [b"escrow", escrow_id.as_ref()],
        bump
    )]
    pub escrow: Account<'info, EscrowAccount>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: payee address only, no signing required here
    pub payee: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FundEscrow<'info> {
    #[account(mut, has_one = payer)]
    pub escrow: Account<'info, EscrowAccount>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub payer_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ReleaseMilestone<'info> {
    #[account(mut, has_one = payer, has_one = payee)]
    pub escrow: Account<'info, EscrowAccount>,
    pub payer: Signer<'info>,
    /// CHECK: payee is verified via escrow constraint
    pub payee: UncheckedAccount<'info>,
    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub payee_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct RefundOnTimeout<'info> {
    #[account(mut, has_one = payer)]
    pub escrow: Account<'info, EscrowAccount>,
    pub payer: Signer<'info>,
    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub payer_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

// ─────────────────────────────────────────────
// State
// ─────────────────────────────────────────────

#[account]
pub struct EscrowAccount {
    pub escrow_id: [u8; 32],
    pub payer: Pubkey,
    pub payee: Pubkey,
    pub total_amount: u64,
    pub released_amount: u64,
    pub milestones: Vec<Milestone>,
    pub current_milestone: u8,
    pub state: EscrowState,
    pub created_at: i64,
    pub timeout_at: i64,
    pub bump: u8,
}

impl EscrowAccount {
    /// Max size: fixed fields + 10 milestones (bounded)
    pub const MAX_SIZE: usize = 32 + 32 + 32 + 8 + 8 + (4 + 10 * Milestone::SIZE) + 1 + 1 + 8 + 8 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct Milestone {
    pub description: [u8; 64], // fixed-size string
    pub release_bps: u16,      // basis points (e.g. 5000 = 50%)
}

impl Milestone {
    pub const SIZE: usize = 64 + 2;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum EscrowState {
    Created,
    Funded,
    Completed,
    Refunded,
    Disputed,
}

// ─────────────────────────────────────────────
// Events
// ─────────────────────────────────────────────

#[event]
pub struct EscrowCreated {
    pub escrow_id: [u8; 32],
    pub payer: Pubkey,
    pub payee: Pubkey,
    pub total_amount: u64,
}

#[event]
pub struct EscrowFunded {
    pub escrow_id: [u8; 32],
    pub amount: u64,
}

#[event]
pub struct MilestoneReleased {
    pub escrow_id: [u8; 32],
    pub milestone_index: u8,
    pub amount: u64,
}

#[event]
pub struct EscrowRefunded {
    pub escrow_id: [u8; 32],
    pub amount: u64,
}

// ─────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────

#[error_code]
pub enum EscrowError {
    #[msg("Invalid escrow state for this operation")]
    InvalidState,
    #[msg("Unauthorized signer")]
    Unauthorized,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Milestone basis points must sum to 10000")]
    MilestoneBpsMismatch,
    #[msg("Invalid number of milestones (1-10)")]
    InvalidMilestoneCount,
    #[msg("All milestones have been released")]
    AllMilestonesReleased,
    #[msg("Timeout period has not been reached yet")]
    TimeoutNotReached,
}
