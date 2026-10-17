import { describe, expect, it } from 'vitest';
import { pickJourneyCard } from './journeyIntent';

describe('pickJourneyCard', () => {
  it('hears a salary account in Hindi', () => {
    expect(pickJourneyCard('मुझे अपनी सैलरी के लिए नया अकाउंट खुलवाना है')).toEqual({
      kind: 'card',
      cardId: 'salary_savings',
    });
  });

  it('hears a bank letter about redoing KYC as Re-KYC', () => {
    expect(pickJourneyCard('My bank sent a letter saying I need to redo my KYC')).toEqual({
      kind: 'card',
      cardId: 'rekyc',
    });
  });

  it('hears the other open journeys', () => {
    expect(pickJourneyCard('I want to open a regular savings account')).toEqual({
      kind: 'card',
      cardId: 'regular_savings',
    });
    expect(pickJourneyCard('Open a basic savings account for me')).toEqual({
      kind: 'card',
      cardId: 'bsbda',
    });
    expect(pickJourneyCard('I need a current account for my shop')).toEqual({
      kind: 'card',
      cardId: 'individual_current',
    });
    expect(pickJourneyCard('Please update my KYC address')).toEqual({
      kind: 'card',
      cardId: 'kyc_update',
    });
  });

  it('does not pick a form this demo does not fill', () => {
    expect(pickJourneyCard('I want a personal loan')).toEqual({ kind: 'later' });
    expect(pickJourneyCard('Send money by NEFT')).toEqual({ kind: 'later' });
  });

  it('leaves the choice alone when the sentence names no form', () => {
    expect(pickJourneyCard('Hello, can you hear me?')).toEqual({ kind: 'unknown' });
  });
});
