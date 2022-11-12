# /usr/bin/perl

use strict;
use warnings;
no warnings qw(experimental::vlb);

my $errorCount = 0;

use Term::ANSIColor;

my @banned = (
    '(?<!((\/\/)|(\/\*)).{0,150})debugger',
);

sub printError {
    my ($fileName, $lineNumber, $line, $pattern) = @_;

    my $colorSet = color('bold red');
    my $colorReset = color('reset');

    $line =~ s/($pattern)/$colorSet$1$colorReset/gi;
    print "$fileName:$lineNumber:$line\n";
    $errorCount++;
}

foreach my $filename (@ARGV) {
    open(my $ifh, $filename) || die "Unable to open $filename: $!";

    my $lineNumber = 0;

    while(my $line = <$ifh>) {
        $lineNumber++;
        chomp $line;

        my $dncPattern = 'do\s+not\s+commit';
        printError($filename, $lineNumber, $line, $dncPattern) if ($line =~ m/$dncPattern/i);

        next if $line =~ /^\s*\/\//;

        foreach my $banned (@banned) {
            printError($filename, $lineNumber, $line, $banned) if ($line =~ $banned);
        }
    }

    close($ifh);
}

exit($errorCount);